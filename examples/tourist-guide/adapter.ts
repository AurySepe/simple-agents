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
 * Factory per istanziare l'adapter VLM per l'agente guida turistica.
 * Collegato a llama-server (porta 30000) con Qwen2.5-VL e supporto GBNF tool calling.
 */
export function createTouristGuideModelAdapter(options?: VisionAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? process.env.VISION_BASE_URL ?? 'http://localhost:30000';
  const modelName = options?.modelName ?? process.env.VISION_MODEL_NAME ?? 'qwen2.5-vl-3b';
  const temperature = options?.temperature ?? 0.2;
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
      max_tokens: maxTokens,
      parallel_tool_calls: false
    }
  });
}

