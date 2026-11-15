import type { InferenceTriple, ModelResult, LanguageModelAdapter } from '@simple-agents/core';

/**
 * ============================================================================
 * INTERFACCIA DEL MODELLO LINGUISTICO: M
 * ============================================================================
 * Rilasciata e re-esportata da @simple-agents/core per retrocompatibilità.
 */
export type { LanguageModelAdapter, InferenceTriple, ModelResult };

// 0. Risolutori di risorse locali e in-memory (MediaResolver)
export * from './common/media-resolver.js';

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

// 6. Client, Strategie e Adapter Google Gemini (Gemini 3 Pro/Flash, Gemini 4 Argon/Carbon)
export * from './gemini/index.js';
