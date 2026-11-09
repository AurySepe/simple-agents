import {
  type LanguageModelAdapter,
  LlamaCppClient,
  LlamaCppModelAdapter,
  LlamaCppQwenStrategy
} from '@formal-agent/adapters';

export interface VisionAdapterOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Factory per istanziare l'adapter di modello linguistico visuale (VLM).
 * Pre-configurato per llama-server con strategia Qwen (o SGLang/Ollama).
 */
export function createVisionAdapter(options?: VisionAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? process.env.VISION_BASE_URL ?? 'http://localhost:30000';
  const modelName = options?.modelName ?? process.env.VISION_MODEL_NAME ?? 'qwen2.5-vl-7b';
  const temperature = options?.temperature ?? 0.2; // Bassa temperatura per massima fedeltà descrittiva
  const maxTokens = options?.maxTokens ?? 2048;
  const timeoutMs = options?.timeoutMs ?? 120000;

  const client = new LlamaCppClient({
    baseUrl,
    timeoutMs
  });

  const strategy = new LlamaCppQwenStrategy({
    reasoningFormat: 'native_field',
    includeHistoricalThinking: false,
    defaultToolChoice: 'required'
  });

  return new LlamaCppModelAdapter({
    client,
    strategy,
    model: modelName,
    options: {
      temperature,
      max_tokens: maxTokens
    }
  });
}
