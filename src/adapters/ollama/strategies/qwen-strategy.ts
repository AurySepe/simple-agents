import { z } from 'zod';
import {
  DataRecord,
  InferenceTriple,
  isDataRecord,
  isNonEmptyArray,
  ModelOutput,
  ToolCall
} from '../../../types/index.js';
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
        "Configurazione incompleta per QwenModelStrategy: 'reasoningFormat' ('native_field' | 'think_tags' | 'none') è obbligatorio."
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
          content: this.includeHistoricalThinking
            ? (pendingThought ?? '')
            : (pendingCalls.length === 0 ? (pendingThought ?? '') : '')
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
        messages.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        });
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

  parseResponse(response: OllamaChatResponse): ModelOutput {
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
        throw new Error(
          `Il modello '${response.model}' ha saturato la finestra di contesto (num_ctx). Generazione troncata per superamento lunghezza (prompt_eval_count=${response.prompt_eval_count ?? 'N/D'}, eval_count=${response.eval_count ?? 'N/D'}). Incrementare 'num_ctx'. Contenuto parziale: "${rawMessage.content || thought || ''}"`
        );
      }
      throw new Error(
        `Il modello '${response.model}' non ha selezionato alcuna azione. L'automa richiede obbligatoriamente almeno un'azione selezionata. Thinking: "${thought || ''}". Contenuto: "${rawMessage.content || ''}"`
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
        `Il modello '${response.model}' non ha selezionato alcuna azione valida.`
      );
    }

    return {
      thought,
      calls
    };
  }
}

