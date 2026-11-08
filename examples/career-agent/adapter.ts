import {
  type LanguageModelAdapter,
  LlamaCppClient,
  LlamaCppModelAdapter,
  LlamaCppQwenStrategy,
} from "../../src/index.js";

export interface CreateCareerLlamaAdapterOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  contextLimit?: number;
  timeoutMs?: number;
  writer?: (message: string) => void;
}

/**
 * Factory helper per istanziare l'adattatore llama-server Qwen con vincolo grammaticale
 * ottimizzato per l'agente di ricerca web.
 */
export function createCareerLlamaAdapter(options?: CreateCareerLlamaAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? "http://localhost:30000";
  const modelName = options?.modelName ?? "qwen3.5-9b";
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 4096;
  const contextLimit = options?.contextLimit ?? 32768;
  const timeoutMs = options?.timeoutMs ?? 180000;
  const write = options?.writer ?? ((msg: string) => console.log(msg));

  const client = new LlamaCppClient({
    baseUrl,
    timeoutMs,
  });

  const strategy = new LlamaCppQwenStrategy({
    reasoningFormat: "native_field",
    includeHistoricalThinking: false,
    defaultToolChoice: "required",
  });

  return new LlamaCppModelAdapter({
    client,
    strategy,
    model: modelName,
    options: {
      temperature,
      max_tokens: maxTokens,
    },
    contextLimit,
    writer: write,
  });
}

