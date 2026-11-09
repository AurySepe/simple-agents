import type { OpenAI } from 'openai';
import { zodFunction } from 'openai/helpers/zod';
import {
  type DataRecord,
  type InferenceTriple,
  isDataRecord,
  isNonEmptyArray,
  isUserMessageContent,
  type ModelOutput,
  type ModelResult,
  type SyntaxErrorToolCall,
  type ToolCall,
  type UserMessageContent,
  type ValidToolCall
} from '@formal-agent/core';
import { resolveMediaBase64, resolveTextFileContent } from '../../common/media-resolver.js';
import {
  SGLangAssistantMessageParam,
  SGLangChatResponse,
  SGLangMessage,
  SGLangModelFamilyStrategy,
  SGLangQwenStrategyOptions,
  SGLangReasoningFormat,
  SGLangToolChoice,
  SGLangToolDefinition
} from '../types.js';

/**
 * Livello 2: Strategia per la famiglia di modelli Qwen (Qwen 2.5, Qwen 3.5) su SGLang.
 * Sfrutta direttamente l'SDK ufficiale OpenAI e i suoi helper per Zod (`zodFunction`),
 * eliminando qualsiasi duplicazione e gestendo al contempo:
 * - L'estrazione del reasoning (da `reasoning_content`, `thinking` o tag `<think>`).
 * - L'applicazione di `tool_choice: "required"` con vincolo XGrammar sui logit.
 * - Lo scarto del preambolo conversazionale ibrido quando ci sono tool_calls (Criticità D).
 * - La validazione rigorosa dei payload (`valid` vs `syntax_error`).
 */
export class SGLangQwenStrategy implements SGLangModelFamilyStrategy {
  readonly reasoningFormat: SGLangReasoningFormat;
  readonly includeHistoricalThinking: boolean;
  readonly defaultToolChoice: 'required' | 'auto';
  readonly parallelToolCalls: boolean;

  constructor(options?: SGLangQwenStrategyOptions) {
    this.reasoningFormat = options?.reasoningFormat ?? 'native_field';
    this.includeHistoricalThinking = options?.includeHistoricalThinking ?? false;
    this.defaultToolChoice = options?.defaultToolChoice ?? 'required';
    this.parallelToolCalls = options?.parallelToolCalls ?? false;
  }

  formatContext(context: InferenceTriple): {
    messages: SGLangMessage[];
    tools?: SGLangToolDefinition[];
    toolChoice?: SGLangToolChoice;
  } {
    const messages: SGLangMessage[] = [];

    // 1. Frame di Sistema F_Ω (puro, senza modifiche)
    messages.push({
      role: 'system',
      content: context.systemFrame
    });

    // 2. Cronologia Ep
    let pendingThought: string | undefined;
    const pendingCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

    const flushPendingAgent = () => {
      if (pendingThought !== undefined || pendingCalls.length > 0) {
        const assistantMsg: SGLangAssistantMessageParam = {
          role: 'assistant',
          content:
            this.includeHistoricalThinking || pendingCalls.length === 0
              ? (pendingThought ?? '')
              : null
        };

        if (this.includeHistoricalThinking && pendingThought) {
          assistantMsg.reasoning_content = pendingThought;
        }

        if (pendingCalls.length > 0) {
          assistantMsg.tool_calls = [...pendingCalls];
        }

        messages.push(assistantMsg);
        pendingThought = undefined;
        pendingCalls.length = 0;
      }
    };

    for (const msg of context.messages) {
      if (msg.type === 'thought') {
        pendingThought = msg.content;
        continue;
      }

      if (msg.type === 'action') {
        pendingCalls.push({
          id: msg.callId,
          type: 'function',
          function: {
            name: msg.content.name,
            arguments: JSON.stringify(msg.content.payload)
          }
        });
        continue;
      }

      // Scarica l'eventuale turno dell'agente precedente
      flushPendingAgent();

      if (msg.type === 'result') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.callId,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
      } else if (msg.type === 'stimulus') {
        const rawContent = msg.content;
        if (typeof rawContent === 'string') {
          messages.push({
            role: 'user',
            content: rawContent
          });
        } else if (isUserMessageContent(rawContent)) {
          switch (rawContent.kind) {
            case 'text':
              messages.push({
                role: 'user',
                content: rawContent.text
              });
              break;

            case 'media':
            case 'text_with_media': {
              const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
              if (rawContent.kind === 'text_with_media' && rawContent.text) {
                parts.push({ type: 'text', text: rawContent.text });
              }

              for (const file of rawContent.files) {
                if (file.modality === 'text_file') {
                  const code = resolveTextFileContent(file);
                  parts.push({
                    type: 'text',
                    text: file.filename ? `File ${file.filename}:\n\`\`\`\n${code}\n\`\`\`` : code
                  });
                } else if (file.modality === 'image') {
                  if (file.source.kind === 'url') {
                    parts.push({
                      type: 'image_url',
                      image_url: { url: file.source.url }
                    });
                  } else {
                    const { base64, mimeType } = resolveMediaBase64(file);
                    parts.push({
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${base64}` }
                    });
                  }
                } else {
                  parts.push({
                    type: 'text',
                    text: `[Allegato ${file.modality}: ${file.filename ?? 'senza nome'}]`
                  });
                }
              }

              messages.push({
                role: 'user',
                content: parts
              });
              break;
            }

            case 'interleaved': {
              const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
              for (const block of rawContent.blocks) {
                if (block.type === 'text') {
                  parts.push({ type: 'text', text: block.text });
                } else {
                  const file = block.media;
                  if (file.modality === 'text_file') {
                    const code = resolveTextFileContent(file);
                    parts.push({
                      type: 'text',
                      text: file.filename ? `File ${file.filename}:\n\`\`\`\n${code}\n\`\`\`` : code
                    });
                  } else if (file.modality === 'image') {
                    if (file.source.kind === 'url') {
                      parts.push({
                        type: 'image_url',
                        image_url: { url: file.source.url }
                      });
                    } else {
                      const { base64, mimeType } = resolveMediaBase64(file);
                      parts.push({
                        type: 'image_url',
                        image_url: { url: `data:${mimeType};base64,${base64}` }
                      });
                    }
                  } else {
                    parts.push({
                      type: 'text',
                      text: `[Allegato ${file.modality}: ${file.filename ?? 'senza nome'}]`
                    });
                  }
                }
              }

              messages.push({
                role: 'user',
                content: parts
              });
              break;
            }
          }
        } else {
          messages.push({
            role: 'user',
            content: JSON.stringify(rawContent)
          });
        }
      }
    }

    flushPendingAgent();

    // 3. Maschera di Visibilità V_Ω (Tools) generata tramite l'helper ufficiale zodFunction
    let tools: OpenAI.Chat.ChatCompletionTool[] | undefined;
    let toolChoice: SGLangToolChoice | undefined;

    if (context.visibleTools.length > 0) {
      tools = context.visibleTools.map((t) =>
        zodFunction({
          name: t.id,
          description: t.description,
          parameters: t.parameters
        })
      );

      // Se ci sono tool visibili, forziamo il tool_choice configurato (default: 'required')
      toolChoice = this.defaultToolChoice;
    }

    return { messages, tools, toolChoice };
  }

  parseResponse(response: SGLangChatResponse): ModelResult {
    if (!response.choices || response.choices.length === 0) {
      throw new Error(`Risposta SGLang priva di scelte (choices vuoto): ${JSON.stringify(response)}`);
    }

    const choice = response.choices[0];
    const rawMessage = choice.message;

    // 1. Estrazione del pensiero (reasoning/thinking) in modo fortemente tipizzato
    let thought: string | undefined;

    switch (this.reasoningFormat) {
      case 'native_field': {
        if (rawMessage.reasoning_content && rawMessage.reasoning_content.trim().length > 0) {
          thought = rawMessage.reasoning_content.trim();
        } else if (rawMessage.thinking && rawMessage.thinking.trim().length > 0) {
          thought = rawMessage.thinking.trim();
        } else if (rawMessage.content) {
          const matchClosed = rawMessage.content.match(/<think>([\s\S]*?)<\/think>/i);
          if (matchClosed) {
            thought = matchClosed[1].trim();
          } else {
            const matchOpen = rawMessage.content.match(/<think>([\s\S]*)$/i);
            if (matchOpen) {
              thought = matchOpen[1].trim();
            }
          }
        }
        break;
      }
      case 'think_tags': {
        if (rawMessage.content) {
          const matchClosed = rawMessage.content.match(/<think>([\s\S]*?)<\/think>/i);
          if (matchClosed) {
            thought = matchClosed[1].trim();
          } else {
            const matchOpen = rawMessage.content.match(/<think>([\s\S]*)$/i);
            if (matchOpen) {
              thought = matchOpen[1].trim();
            }
          }
        }
        break;
      }
      case 'none': {
        thought = undefined;
        break;
      }
    }

    // 2. Estrazione e validazione delle Tool Calls
    const rawCalls = rawMessage.tool_calls;
    if (!rawCalls || rawCalls.length === 0) {
      if (choice.finish_reason === 'length') {
        const thoughtLength = thought ? thought.length : 0;
        const thoughtTail = thought ? `\nThinking finale (ultimi 1500 caratteri di ${thoughtLength}):\n${thought.slice(-1500)}` : '';
        return {
          status: 'stall',
          stall: {
            reason: 'thinking_budget_exhausted',
            partialThought: thought || rawMessage.content || '',
            message: `Il modello '${response.model}' ha saturato il budget di token di pensiero (finish_reason='length') prima di selezionare un'azione.${thoughtTail}`
          }
        };
      }
      throw new Error(
        `Il modello '${response.model}' non ha selezionato alcuna azione. L'automa richiede obbligatoriamente almeno un'azione selezionata. Thinking: "${thought || ''}". Contenuto: "${rawMessage.content || ''}"`
      );
    }

    const effectiveCalls = this.parallelToolCalls === false ? rawCalls.slice(0, 1) : rawCalls;

    const calls: ToolCall[] = effectiveCalls.map((tc, index) => {
      const callId = tc.id || `call_${index}_${Date.now()}`;
      if (tc.type === 'function') {
        const rawArgs = tc.function.arguments;
        if (typeof rawArgs === 'string') {
          try {
            const parsed = JSON.parse(rawArgs);
            const args: DataRecord = isDataRecord(parsed) ? parsed : { value: parsed };
            const validCall: ValidToolCall = {
              status: 'valid',
              id: callId,
              name: tc.function.name,
              payload: args
            };
            return validCall;
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const syntaxCall: SyntaxErrorToolCall = {
              status: 'syntax_error',
              id: callId,
              name: tc.function.name,
              rawText: rawArgs,
              errorDetail: errorMsg,
              payload: { raw: rawArgs }
            };
            return syntaxCall;
          }
        }

        const args: DataRecord = isDataRecord(rawArgs) ? rawArgs : {};
        const validCall: ValidToolCall = {
          status: 'valid',
          id: callId,
          name: tc.function.name,
          payload: args
        };
        return validCall;
      }

      const customCall: ValidToolCall = {
        status: 'valid',
        id: callId,
        name: tc.custom.name,
        payload: { value: tc.custom.input }
      };
      return customCall;
    });

    if (!isNonEmptyArray(calls)) {
      throw new Error(
        `Invariante violato: l'array delle tool calls per il modello '${response.model}' è inaspettatamente vuoto.`
      );
    }

    return {
      thought,
      calls
    };
  }
}
