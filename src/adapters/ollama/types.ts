import { DataRecord, InferenceTriple, ModelOutput } from '../../types/index.js';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  thinking?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function: {
      index?: number;
      name: string;
      arguments: DataRecord | string;
    };
  }>;
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: DataRecord;
  };
}

export interface OllamaChatOptions {
  temperature: number;
  num_ctx?: number;
  num_predict?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  stop?: string[];
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaToolDefinition[];
  stream: false;
  options: OllamaChatOptions;
  keep_alive?: string | number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function: {
        index?: number;
        name: string;
        arguments: DataRecord | string;
      };
    }>;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaMetrics {
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalCount: number;
  promptEvalDurationMs: number;
  evalCount: number;
  evalDurationMs: number;
  tokensPerSecond: number;
  numCtx?: number;
  contextTruncated?: boolean;
  contextSaturationRatio?: number;
}

export interface ContextTruncationWarning {
  promptEvalCount: number;
  numCtx: number;
  saturationRatio: number;
}

/**
 * Modalità esplicita con cui il server Ollama o il modello restituisce il monologo interiore:
 * - 'native_field': Ollama estrae e popola direttamente il campo dedicato `message.thinking`.
 * - 'think_tags': il pensiero è incorporato in `message.content` racchiuso tra i tag `<think>...</think>`.
 * - 'none': il modello o la versione in uso non genera o non estrae reasoning interiore.
 */
export type OllamaReasoningFormat = 'native_field' | 'think_tags' | 'none';

export interface QwenStrategyOptions {
  reasoningFormat: OllamaReasoningFormat;
}

/**
 * Strategia di interpretazione e formattazione specifica per famiglia di modelli.
 */
export interface ModelFamilyStrategy {
  formatContext(context: InferenceTriple): {
    messages: OllamaMessage[];
    tools?: OllamaToolDefinition[];
  };

  parseResponse(response: OllamaChatResponse): ModelOutput;
}

