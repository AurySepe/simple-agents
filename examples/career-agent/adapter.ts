import {
  type LanguageModelAdapter,
  LlamaCppClient,
  LlamaCppModelAdapter,
  LlamaCppQwenStrategy,
  createGeminiAdapter,
  GeminiModelAdapter,
  type GeminiModelError,
  NodeFileSystemMediaResolver,
  type MediaResolver
} from "@formal-agent/adapters";

export interface CreateCareerLlamaAdapterOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  maxTokens?: number;
  contextLimit?: number;
  timeoutMs?: number;
  writer?: (message: string) => void;
}

export interface CreateCareerGeminiAdapterOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  mediaResolver?: MediaResolver;
}

/**
 * Factory helper per istanziare l'adapter ufficiale Google Gemini (Gemini 3 / 4).
 */
export function createCareerGeminiAdapter(options: CreateCareerGeminiAdapterOptions): GeminiModelAdapter {
  return createGeminiAdapter({
    apiKey: options.apiKey,
    model: options.model,
    mediaResolver: options.mediaResolver ?? new NodeFileSystemMediaResolver(),
    options: {
      timeoutMs: options.timeoutMs ?? 60000,
      temperature: options.temperature
    }
  });
}

/**
 * Factory helper per istanziare l'adattatore llama-server Qwen con vincolo grammaticale
 * ottimizzato per l'agente di ricerca web.
 * Ritorna LlamaCppModelAdapter preservando i tipi specifici di errore.
 */
export function createCareerLlamaAdapter(options?: CreateCareerLlamaAdapterOptions): LlamaCppModelAdapter {
  const baseUrl = options?.baseUrl ?? "http://localhost:30000";
  const modelName = options?.modelName ?? "qwen3.5-9b";
  // Con i modelli di reasoning (CoT), temperature=0.6 e presence_penalty=0.3 impediscono
  // gli attrattori ciclici (loop deliberativi infiniti), preservando il vincolo grammaticale GBNF sui tool.
  const temperature = options?.temperature ?? 0.6;
  const topP = options?.topP ?? 0.95;
  const presencePenalty = options?.presencePenalty ?? 0.3;
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
      top_p: topP,
      presence_penalty: presencePenalty,
      max_tokens: maxTokens,
    },
  });
}

