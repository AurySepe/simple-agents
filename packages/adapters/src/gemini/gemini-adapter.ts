import {
  type DataRecord,
  type InferenceTriple,
  type ModelDeliberateResult,
  type ModelOutput,
  type ModelStallOutput,
  type NonEmptyArray,
  type ToolCallInput,
  modelFail,
  modelOk
} from '@formal-agent/core';
import { FinishReason, GoogleGenAI } from '@google/genai';
import type { LanguageModelAdapter } from '../index.js';
import { GeminiStrategy } from './gemini-strategy.js';
import type {
  GeminiAdapterConfig,
  GeminiChatOptions,
  GeminiMetrics,
  GeminiModelError
} from './types.js';

export function parseGeminiError(err: unknown, timeoutMs?: number): GeminiModelError {
  if (err && typeof err === 'object') {
    // 1. Timeout / AbortError
    if ('name' in err && (err as { name: string }).name === 'AbortError') {
      return {
        type: 'NETWORK_TIMEOUT',
        message:
          timeoutMs !== undefined
            ? `Gemini inference request timed out after ${timeoutMs}ms`
            : 'Gemini inference request timed out',
        timeoutMs
      };
    }

    const errorObj = err as Record<string, unknown>;
    const message = typeof errorObj.message === 'string' ? errorObj.message : String(err);
    const status = typeof errorObj.status === 'number' ? errorObj.status : undefined;

    // 2. Rate limit (429 / RESOURCE_EXHAUSTED)
    if (status === 429 || message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      const retryMatch = message.match(/retry after (\d+)/i) || message.match(/retryAfter: (\d+)/i);
      const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : undefined;
      return {
        type: 'RATE_LIMIT_EXCEEDED',
        message: `Gemini API rate limit exceeded: ${message}`,
        status: 429,
        retryAfterMs
      };
    }

    // 3. API Key invalida / Permessi negati (400, 401, 403, PERMISSION_DENIED)
    if (
      status === 401 ||
      status === 403 ||
      message.includes('API_KEY_INVALID') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('API key not valid')
    ) {
      return {
        type: 'INVALID_API_KEY',
        message: `Gemini API authentication failed: ${message}`,
        status: (status as 400 | 401 | 403) ?? 401
      };
    }

    // 4. Servizio Google non disponibile (503 / 500 / UNAVAILABLE)
    if (status === 503 || status === 500 || message.includes('UNAVAILABLE')) {
      return {
        type: 'SERVICE_UNAVAILABLE',
        message: `Gemini service is temporarily unavailable: ${message}`,
        status: status ?? 503
      };
    }

    // 5. Contesto troppo grande
    if (message.includes('context length') || message.includes('token count exceeds')) {
      return {
        type: 'CONTEXT_WINDOW_EXCEEDED',
        message: `Gemini context window exceeded: ${message}`
      };
    }
  }

  const genericMsg = err instanceof Error ? err.message : String(err);
  return {
    type: 'NETWORK_ERROR',
    message: `Gemini network/transport error: ${genericMsg}`,
    cause: err
  };
}

/**
 * Adapter formale di prima classe per la famiglia di modelli Google Gemini
 * (Gemini 3 Pro/Flash, Gemini 4 Argon/Carbon) conforme all'interfaccia LanguageModelAdapter.
 *
 * Tutte le configurazioni (modello, chiave API, opzioni di generazione, timeout)
 * devono essere fornite esplicitamente senza default impliciti.
 */
export class GeminiModelAdapter implements LanguageModelAdapter<GeminiModelError> {
  private readonly client: GoogleGenAI;
  private readonly strategy: GeminiStrategy;
  readonly model: string;
  readonly options: GeminiChatOptions;
  readonly onMetrics?: (metrics: GeminiMetrics) => void;

  constructor(config: GeminiAdapterConfig) {
    if (!config) {
      throw new Error('GeminiAdapterConfig must be provided explicitly.');
    }
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
      throw new Error('Gemini API key must be explicitly provided in config.apiKey.');
    }
    if (!config.model || typeof config.model !== 'string' || config.model.trim().length === 0) {
      throw new Error('Gemini model name must be explicitly provided in config.model.');
    }

    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.options = config.options ?? {};
    this.strategy = new GeminiStrategy(this.options);
    this.onMetrics = config.onMetrics;
  }

  public async infer(context: InferenceTriple): Promise<ModelDeliberateResult<GeminiModelError>> {
    const formatted = this.strategy.format(context);
    const timeoutMs = this.options.timeoutMs;
    const abortSignal = timeoutMs !== undefined ? AbortSignal.timeout(timeoutMs) : undefined;
    const startTime = Date.now();

    try {
      const generateConfig: Record<string, unknown> = {};
      if (formatted.systemInstruction) generateConfig.systemInstruction = formatted.systemInstruction;
      if (formatted.tools) generateConfig.tools = formatted.tools;
      if (formatted.toolConfig) generateConfig.toolConfig = formatted.toolConfig;
      if (formatted.thinkingConfig) generateConfig.thinkingConfig = formatted.thinkingConfig;
      if (this.options.temperature !== undefined) generateConfig.temperature = this.options.temperature;
      if (this.options.topP !== undefined) generateConfig.topP = this.options.topP;
      if (this.options.topK !== undefined) generateConfig.topK = this.options.topK;
      if (this.options.maxOutputTokens !== undefined) generateConfig.maxOutputTokens = this.options.maxOutputTokens;
      if (this.options.stopSequences !== undefined) generateConfig.stopSequences = this.options.stopSequences;
      if (abortSignal) generateConfig.abortSignal = abortSignal;

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: formatted.contents as any,
        config: generateConfig as any
      });

      const durationMs = Date.now() - startTime;
      const candidate = response.candidates?.[0];

      // 1. Controllo Safety e Recitation finishReasons
      if (candidate?.finishReason === FinishReason.SAFETY) {
        return modelFail<GeminiModelError>({
          type: 'SAFETY_BLOCKED',
          message: 'Gemini refused to generate content due to safety thresholds.',
          finishReason: 'SAFETY',
          ratings: candidate.safetyRatings
        });
      }

      if (candidate?.finishReason === FinishReason.RECITATION) {
        return modelFail<GeminiModelError>({
          type: 'RECITATION_BLOCKED',
          message: 'Gemini stopped generation to prevent regurgitation of copyrighted material.',
          finishReason: 'RECITATION'
        });
      }

      // 2. Estrazione Pensiero (Thought / Reasoning)
      let extractedThought: string | undefined = undefined;
      const thoughtParts = candidate?.content?.parts?.filter(
        (p: any) => p.thought === true || (p.text && p.text.startsWith('<thought>'))
      );
      if (thoughtParts && thoughtParts.length > 0) {
        extractedThought = thoughtParts.map((p: any) => p.text ?? '').join('\n').trim();
      }

      // 3. Estrazione Tool Calls (Function Calls)
      const rawCalls = response.functionCalls ?? [];
      const calls: ToolCallInput[] = rawCalls.map((fc: any, index: number) => ({
        status: 'valid' as const,
        id: `gemini_call_${Date.now()}_${index}`,
        name: (fc.name as string) ?? 'unknown_tool',
        payload: (fc.args as DataRecord) ?? {}
      }));

      // 4. Gestione assenza di tool calls (Stall vs Nessuna Azione)
      if (calls.length === 0) {
        // Se il modello ha esaurito il proprio budget di token prima di completare la deliberazione
        if (candidate?.finishReason === FinishReason.MAX_TOKENS) {
          const stallOutput: ModelStallOutput = {
            status: 'stall',
            stall: {
              reason: 'thinking_budget_exhausted',
              partialThought: extractedThought ?? response.text ?? '',
              message: `Model '${this.model}' exhausted its token budget (MAX_TOKENS) before selecting an action.`
            },
            usage: {
              promptTokens: response.usageMetadata?.promptTokenCount,
              completionTokens: response.usageMetadata?.candidatesTokenCount,
              totalTokens: response.usageMetadata?.totalTokenCount
            }
          };
          return modelOk(stallOutput);
        }

        // Altrimenti il modello non ha selezionato alcuna azione: errore formale controllato
        return modelFail<GeminiModelError>({
          type: 'NO_ACTION_SELECTED',
          message: `Model '${this.model}' completed deliberation without selecting any tool actions.`,
          rawResponseText: response.text
        });
      }

      const usageMetadata = response.usageMetadata;
      const metrics: GeminiMetrics = {
        promptTokens: usageMetadata?.promptTokenCount,
        candidatesTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
        thoughtsTokens: (usageMetadata as any)?.thoughtsTokenCount,
        durationMs
      };

      if (this.onMetrics) {
        this.onMetrics(metrics);
      }

      const modelOutput: ModelOutput = {
        thought: extractedThought,
        calls: calls as NonEmptyArray<ToolCallInput>,
        usage: {
          promptTokens: metrics.promptTokens,
          completionTokens: metrics.candidatesTokens,
          totalTokens: metrics.totalTokens,
          tokensPerSecond:
            metrics.candidatesTokens && durationMs > 0
              ? (metrics.candidatesTokens / durationMs) * 1000
              : undefined
        }
      };

      return modelOk(modelOutput);
    } catch (err: unknown) {
      const parsedError = parseGeminiError(err, timeoutMs);
      return modelFail(parsedError);
    }
  }
}

/**
 * Factory helper per istanziare il GeminiModelAdapter.
 * Richiede la configurazione esplicita di apiKey e model.
 */
export function createGeminiAdapter(config: GeminiAdapterConfig): GeminiModelAdapter {
  return new GeminiModelAdapter(config);
}
