/**
 * ============================================================================
 * ADAPTER LLAMA-SERVER (LLAMA.CPP) BASATO SU SDK UFFICIALE OPENAI
 * ============================================================================
 * Re-esporta i moduli di trasporto e le strategie OpenAI-compatibili
 * con nomenclatura esplicita per llama-server (llama.cpp CUDA).
 */
export {
  SGLangClient as LlamaCppClient,
  type SGLangClientConfig as LlamaCppClientConfig,
  type SGLangChatPayload as LlamaCppChatPayload,
  type SGLangChatInvocationOptions as LlamaCppChatInvocationOptions
} from '../sglang/client.js';

export {
  SGLangQwenStrategy as LlamaCppQwenStrategy
} from '../sglang/strategies/qwen-strategy.js';

export {
  SGLangModelAdapter as LlamaCppModelAdapter,
  type SGLangModelAdapterConfig as LlamaCppModelAdapterConfig
} from '../sglang/sglang-adapter.js';

export {
  type SGLangQwenStrategyOptions as LlamaCppQwenStrategyOptions
} from '../sglang/types.js';

export * from '../sglang/types.js';
