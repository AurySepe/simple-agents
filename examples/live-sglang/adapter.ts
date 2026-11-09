import {
  LanguageModelAdapter,
  SGLangClient,
  SGLangModelAdapter,
  SGLangQwenStrategy
} from '@formal-agent/adapters';

export interface CreateSGLangAdapterOptions {
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
 * Factory helper per istanziare l'adattatore SGLang Qwen.
 */
export function createSGLangQwenAdapter(options?: CreateSGLangAdapterOptions): LanguageModelAdapter {
  const baseUrl = options?.baseUrl ?? 'http://localhost:30000';
  const modelName = options?.modelName ?? 'QuantTrio/Qwen3.5-9B-AWQ';
  const temperature = options?.temperature ?? 0;
  const maxTokens = options?.maxTokens ?? 4096;
  const contextLimit = options?.contextLimit ?? 8192;
  const timeoutMs = options?.timeoutMs ?? 120000;
  const includeHistoricalThinking = options?.includeHistoricalThinking ?? false;
  const write = options?.writer ?? ((msg: string) => console.log(msg));

  // 1. Client HTTP di trasporto verso SGLang OpenAI compatible endpoint
  const client = new SGLangClient({
    baseUrl,
    timeoutMs
  });

  // 2. Strategia di famiglia Qwen (con vincolo tool_choice='required' garantito da XGrammar)
  const strategy = new SGLangQwenStrategy({
    reasoningFormat: 'native_field',
    includeHistoricalThinking,
    defaultToolChoice: 'required'
  });

  // 3. Adapter composito
  return new SGLangModelAdapter({
    client,
    strategy,
    model: modelName,
    options: {
      temperature,
      max_tokens: maxTokens,
      context_limit: contextLimit,
      tool_choice: 'required'
    },
    onMetrics: (m) => {
      const saturationStr =
        m.contextSaturationRatio !== undefined
          ? ` | Sat: ${(m.contextSaturationRatio * 100).toFixed(1)}% (${m.promptTokens}/${m.contextLimit} tok)`
          : '';
      write(
        `📊 [Inferenza SGLang] Prompt: ${m.promptTokens} tok | Generati: ${m.completionTokens} tok${saturationStr} | Velocità: ${m.tokensPerSecond.toFixed(1)} tok/s`
      );
    },
    onContextTruncation: (w) => {
      write(
        `⚠️ [Warning Contesto] Rilevata saturazione del contesto (${w.promptTokens}/${w.contextLimit} tok, ${(w.saturationRatio * 100).toFixed(1)}%)!`
      );
    }
  });
}

