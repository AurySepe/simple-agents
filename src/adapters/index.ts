import { InferenceTriple, ModelOutput } from '../types/index.js';

/**
 * ============================================================================
 * INTERFACCIA DEL MODELLO LINGUISTICO: M
 * ============================================================================
 * Il Framework definisce il Modello come una funzione pura di inferenza:
 * M: C_Ω -> Promise<ModelOutput>
 *
 * L'implementazione reale (Gemini, Claude, OpenAI, mock di test, ecc.)
 * viene fornita dall'utente del framework tramite dependency injection.
 */
export interface LanguageModelAdapter {
  infer(context: InferenceTriple): Promise<ModelOutput>;
}

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
