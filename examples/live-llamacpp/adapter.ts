import {
  LanguageModelAdapter,
  LlamaCppClient,
  LlamaCppModelAdapter,
  LlamaCppQwenStrategy
} from '@formal-agent/adapters';

export interface CreateLlamaCppAdapterOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  contextLimit?: number;
  timeoutMs?: number;
  includeHistoricalThinking?: boolean;
  writer?: (message: string) => void;
}

/**
 * Factory helper per istanziare l'adattatore llama-server Qwen con vincolo grammaticale.
 */
export function createLlamaCppQwenAdapter(options?: CreateLlamaCppAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? 'http://localhost:30000';
  const modelName = options?.modelName ?? 'qwen3.5-9b';
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 4096;
  const contextLimit = options?.contextLimit ?? 8192;
  const timeoutMs = options?.timeoutMs ?? 120000;
  const includeHistoricalThinking = options?.includeHistoricalThinking ?? false;
  const write = options?.writer ?? ((msg: string) => console.log(msg));

  // 1. Client HTTP di trasporto verso llama-server (endpoint OpenAI /v1)
  const client = new LlamaCppClient({
    baseUrl,
    timeoutMs
  });

  // 2. Strategia di famiglia Qwen con vincolo tool_choice='required'
  const strategy = new LlamaCppQwenStrategy({
    reasoningFormat: 'native_field',
    includeHistoricalThinking,
    defaultToolChoice: 'required'
  });

  // 3. Adapter composito
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

