import {
  LanguageModelAdapter,
  OllamaClient,
  OllamaModelAdapter,
  QwenModelStrategy
} from '../../src/index.js';

/**
 * ============================================================================
 * ADATTATORE DEL MODELLO LINGUISTICO: QWEN 3.5 SU OLLAMA LOCALE
 * ============================================================================
 * Configura il trasporto HTTP (OllamaClient), la strategia specifica per
 * la famiglia Qwen (QwenModelStrategy) e l'adapter unificato (OllamaModelAdapter).
 */

export interface CreateOllamaAdapterOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  numCtx?: number;
  timeoutMs?: number;
}

export function createOllamaQwenAdapter(options?: CreateOllamaAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? 'http://localhost:11434';
  const modelName = options?.modelName ?? 'qwen3.5:9b';
  const temperature = options?.temperature ?? 0;
  const numCtx = options?.numCtx ?? 16384;
  const timeoutMs = options?.timeoutMs ?? 120000;

  // 1. Client HTTP di trasporto
  const client = new OllamaClient({
    baseUrl,
    timeoutMs // 90s per gestire in sicurezza anche l'eventuale cold start della GPU
  });

  // 2. Strategia di famiglia Qwen (estrazione deterministica del pensiero dal campo native message.thinking)
  const strategy = new QwenModelStrategy({
    reasoningFormat: 'native_field'
  });

  // 3. Adapter composito
  return new OllamaModelAdapter({
    client,
    strategy,
    model: modelName,
    options: {
      temperature,
      num_ctx: numCtx
    },
    onMetrics: (m) => {
      console.log(
        `📊 [Inferenza Ollama] Prompt: ${m.promptEvalCount} tok | Generati: ${m.evalCount} tok | Velocità: ${m.tokensPerSecond.toFixed(1)} tok/s`
      );
    },
    onContextTruncation: (w) => {
      console.warn(
        `⚠️ [Warning Contesto] Rilevata saturazione del contesto (${w.promptEvalCount}/${w.numCtx} tok)!`
      );
    }
  });
}

