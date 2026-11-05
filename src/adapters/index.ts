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

