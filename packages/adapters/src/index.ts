import { InferenceTriple, ModelResult, LanguageModelAdapter } from '@formal-agent/core';

/**
 * ============================================================================
 * INTERFACCIA DEL MODELLO LINGUISTICO: M
 * ============================================================================
 * Rilasciata e re-esportata da @formal-agent/core per retrocompatibilità.
 */
export { LanguageModelAdapter };

// 1. Client e Tipi di Trasporto Ollama
export * from './ollama/types.js';
export * from './ollama/client.js';

// 2. Strategie di Famiglia Ollama
export * from './ollama/strategies/qwen-strategy.js';

// 3. Adapter Composito Ollama
export * from './ollama/ollama-adapter.js';

// 4. Client, Strategie e Adapter SGLang (OpenAI Compatible + XGrammar)
export * from './sglang/index.js';

// 5. Client, Strategie e Adapter llama-server (OpenAI Compatible + GBNF Grammar)
export * from './llamacpp/index.js';
