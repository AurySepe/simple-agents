import { z } from 'zod';
import {
  type DataRecord,
  type InferenceTriple,
  isDataRecord,
  isNonEmptyArray,
  isUserMessageContent,
  type ModelOutput,
  type ModelResult,
  type ToolCall,
  type UserMessageContent
} from '@simple-agents/core';
import { resolveMediaBase64, resolveTextFileContent } from '../../common/media-resolver.js';
import {
  ModelFamilyStrategy,
  OllamaChatResponse,
  OllamaMessage,
  OllamaReasoningFormat,
  OllamaToolDefinition,
  QwenStrategyOptions
} from '../types.js';

/**
 * Strategia per la famiglia di modelli Qwen (Qwen 2.5, Qwen 3.5, Qwen 3.6).
 * Gestisce nativamente:
 * - L'estrazione deterministica del monologo interiore secondo il formato dichiarato dall'utente.
 * - Le invocazioni strutturate dei tool (`tool_calls`).
 * - La mappatura pulita della tripla formale C_Ω senza alterare il frame di sistema.
 * - La garanzia di tipo NonEmptyArray<ToolCall> sulle azioni restituite.
 */
export class QwenModelStrategy implements ModelFamilyStrategy {
  readonly reasoningFormat: OllamaReasoningFormat;
  readonly includeHistoricalThinking: boolean;

  constructor(options: QwenStrategyOptions) {
    if (!options || !options.reasoningFormat) {
      throw new Error(
        "Incomplete configuration for QwenModelStrategy: 'reasoningFormat' ('native_field' | 'think_tags' | 'none') is required."
      );
    }
    this.reasoningFormat = options.reasoningFormat;
    this.includeHistoricalThinking = options.includeHistoricalThinking ?? false;
  }
  formatContext(context: InferenceTriple): {
    messages: OllamaMessage[];
    tools?: OllamaToolDefinition[];
  } {
    const messages: OllamaMessage[] = [];

    // 1. Frame di Sistema F_Ω (puro, senza modifiche)
    messages.push({
      role: 'system',
      content: context.systemFrame
    });

    // 2. Cronologia Ep
    let pendingThought: string | undefined;
    const pendingCalls: Array<{
      id: string;
      name: string;
      payload: DataRecord;
    }> = [];

    const flushPendingAgent = () => {
      if (pendingThought !== undefined || pendingCalls.length > 0) {
        const assistantMsg: OllamaMessage = {
          role: 'assistant',
          content: (this.includeHistoricalThinking || pendingCalls.length === 0)
            ? (pendingThought ?? '')
            : ''
        };

        if (pendingCalls.length > 0) {
          assistantMsg.tool_calls = pendingCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.name,
              arguments: c.payload
            }
          }));
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
          name: msg.content.name,
          payload: msg.content.payload
        });
        continue;
      }

      // Scarica l'eventuale turno dell'agente precedente
      flushPendingAgent();

      if (msg.type === 'result') {
        // Esito di un tool (sia risposta del mondo che errore nativo)
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
              const images: string[] = [];
              const textBlocks: string[] = rawContent.kind === 'text_with_media' ? [rawContent.text] : [];

              for (const file of rawContent.files) {
                if (file.modality === 'text_file') {
                  const code = resolveTextFileContent(file);
                  textBlocks.push(file.filename ? `File ${file.filename}:\n\`\`\`\n${code}\n\`\`\`` : code);
                } else if (file.modality === 'image') {
                  const { base64 } = resolveMediaBase64(file);
                  images.push(base64);
                } else {
                  textBlocks.push(`[Allegato ${file.modality}: ${file.filename ?? 'senza nome'}]`);
                }
              }

              messages.push({
                role: 'user',
                content: textBlocks.join('\n\n'),
                ...(images.length > 0 ? { images } : {})
              });
              break;
            }

            case 'interleaved': {
              const images: string[] = [];
              const textBlocks: string[] = [];

              for (const block of rawContent.blocks) {
                if (block.type === 'text') {
                  textBlocks.push(block.text);
                } else {
                  if (block.media.modality === 'text_file') {
                    const code = resolveTextFileContent(block.media);
                    textBlocks.push(block.media.filename ? `File ${block.media.filename}:\n\`\`\`\n${code}\n\`\`\`` : code);
                  } else if (block.media.modality === 'image') {
                    const { base64 } = resolveMediaBase64(block.media);
                    images.push(base64);
                  } else {
                    textBlocks.push(`[Allegato ${block.media.modality}: ${block.media.filename ?? 'senza nome'}]`);
                  }
                }
              }

              messages.push({
                role: 'user',
                content: textBlocks.join('\n\n'),
                ...(images.length > 0 ? { images } : {})
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

    // 3. Maschera di Visibilità V_Ω (Tools)
    let tools: OllamaToolDefinition[] | undefined;
    if (context.visibleTools.length > 0) {
      tools = context.visibleTools.map((t) => {
        const rawSchema = z.toJSONSchema(t.parameters, { target: 'openapi-3.0' });
        const cleanSchema: DataRecord = isDataRecord(rawSchema) ? rawSchema : {};
        return {
          type: 'function',
          function: {
            name: t.id,
            description: t.description,
            parameters: cleanSchema
          }
        };
      });
    }

    return { messages, tools };
  }

  parseResponse(response: OllamaChatResponse): ModelResult {
    const rawMessage = response.message;

    // 1. Estrazione deterministica del pensiero secondo la modalità esplicita configurata dall'utente
    let thought: string | undefined;

    switch (this.reasoningFormat) {
      case 'native_field': {
        if (rawMessage.thinking && rawMessage.thinking.trim().length > 0) {
          thought = rawMessage.thinking.trim();
        }
        // Nota Criticità D (Generazione Ibrida):
        // I test empirici su Qwen confermano che quando sono presenti tool_calls,
        // qualsiasi testo in message.content è puro preambolo conversazionale superfluo (chatter),
        // privo di valore logico rispetto a thinking. Viene quindi scartato per preservare
        // l'invariante formale che ammette solo 'thought' (epistemico) e 'calls' (operativo).
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
      if (response.done_reason === 'length') {
        const thoughtLength = thought ? thought.length : 0;
        const thoughtTail = thought ? `\nThinking finale (ultimi 1500 caratteri di ${thoughtLength}):\n${thought.slice(-1500)}` : '';
        return {
          status: 'stall',
          stall: {
            reason: 'thinking_budget_exhausted',
            partialThought: thought || rawMessage.content || '',
            message: `Model '${response.model}' exhausted its thinking token budget (done_reason='length') before selecting an action.${thoughtTail}`
          }
        };
      }
      throw new Error(
        `Model '${response.model}' selected no action. The automaton strictly requires at least one action to be selected. Thinking: "${thought || ''}". Content: "${rawMessage.content || ''}"`
      );
    }

    const calls: ToolCall[] = rawCalls.map((tc, index) => {
      const callId = tc.id || `call_${index}_${Date.now()}`;
      if (typeof tc.function.arguments === 'string') {
        try {
          const parsed = JSON.parse(tc.function.arguments);
          const args = isDataRecord(parsed) ? parsed : { value: parsed };
          return {
            status: 'valid',
            id: callId,
            name: tc.function.name,
            payload: args
          };
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            status: 'syntax_error',
            id: callId,
            name: tc.function.name,
            rawText: tc.function.arguments,
            errorDetail: errorMsg,
            payload: { raw: tc.function.arguments }
          };
        }
      } else if (isDataRecord(tc.function.arguments)) {
        return {
          status: 'valid',
          id: callId,
          name: tc.function.name,
          payload: tc.function.arguments
        };
      } else {
        return {
          status: 'valid',
          id: callId,
          name: tc.function.name,
          payload: {}
        };
      }
    });

    if (!isNonEmptyArray(calls)) {
      throw new Error(
        `Model '${response.model}' selected no valid action.`
      );
    }

    return {
      thought,
      calls
    };
  }
}

export { QwenModelStrategy as OllamaQwenStrategy };

