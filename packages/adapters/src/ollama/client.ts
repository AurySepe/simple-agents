import { OllamaChatRequest, OllamaChatResponse, OllamaMetrics } from './types.js';

export interface OllamaClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export interface OllamaChatInvocationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

function isOllamaChatResponse(val: unknown): val is OllamaChatResponse {
  return typeof val === 'object' && val !== null && 'message' in val;
}

/**
 * Livello di trasporto HTTP puro verso Ollama.
 * Non applica modifiche al payload e richiede configurazione esplicita dall'utente.
 */
export class OllamaClient {
  readonly baseUrl: string;
  readonly timeoutMs?: number;

  constructor(config: OllamaClientConfig) {
    if (!config.baseUrl || config.baseUrl.trim().length === 0) {
      throw new Error("OllamaClient richiede un parametro 'baseUrl' esplicito e non vuoto.");
    }
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs;
  }

  async chat(
    request: OllamaChatRequest,
    invocationOptions?: OllamaChatInvocationOptions
  ): Promise<{ response: OllamaChatResponse; metrics: OllamaMetrics }> {
    const startWallTime = Date.now();
    const effectiveTimeoutMs = invocationOptions?.timeoutMs ?? this.timeoutMs;

    const signals: AbortSignal[] = [];
    if (invocationOptions?.signal) {
      signals.push(invocationOptions.signal);
    }
    if (effectiveTimeoutMs !== undefined && effectiveTimeoutMs > 0) {
      signals.push(AbortSignal.timeout(effectiveTimeoutMs));
    }

    let signal: AbortSignal | undefined;
    if (signals.length === 1) {
      signal = signals[0];
    } else if (signals.length > 1) {
      signal = AbortSignal.any(signals);
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        ...(signal ? { signal } : {})
      });
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error(`Chiamata Ollama interrotta per timeout (${effectiveTimeoutMs}ms).`);
      }
      throw err;
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Errore chiamata Ollama HTTP ${res.status}: ${errorBody}`);
    }

    const raw = await res.json();
    if (!isOllamaChatResponse(raw)) {
      throw new Error(`Risposta Ollama non valida: ${JSON.stringify(raw)}`);
    }
    const reqDurationMs = Date.now() - startWallTime;

    const evalDurationMs = (raw.eval_duration ?? 0) / 1_000_000;
    const evalCount = raw.eval_count ?? 0;
    const tokensPerSecond = evalDurationMs > 0 ? (evalCount / evalDurationMs) * 1000 : 0;

    const numCtx = request.options.num_ctx;
    const promptEvalCount = raw.prompt_eval_count ?? 0;
    const hasNumCtx = typeof numCtx === 'number' && numCtx > 0;
    const contextTruncated = hasNumCtx ? promptEvalCount >= numCtx : undefined;
    const contextSaturationRatio = hasNumCtx ? promptEvalCount / numCtx : undefined;

    const metrics: OllamaMetrics = {
      totalDurationMs: (raw.total_duration ?? 0) / 1_000_000 || reqDurationMs,
      loadDurationMs: (raw.load_duration ?? 0) / 1_000_000,
      promptEvalCount,
      promptEvalDurationMs: (raw.prompt_eval_duration ?? 0) / 1_000_000,
      evalCount,
      evalDurationMs,
      tokensPerSecond,
      ...(hasNumCtx ? { numCtx, contextTruncated, contextSaturationRatio } : {})
    };

    return { response: raw, metrics };
  }
}

