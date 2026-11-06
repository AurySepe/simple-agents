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

// 2. Strategie di Famiglia
export * from './ollama/strategies/qwen-strategy.js';

// 3. Adapter Composito
export * from './ollama/ollama-adapter.js';
