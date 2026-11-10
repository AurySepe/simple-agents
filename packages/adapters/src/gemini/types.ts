import type { DataRecord } from '@formal-agent/core';
import type { ThinkingLevel } from '@google/genai';

/**
 * ============================================================================
 * ERRORI INFRASTRUTTURALI / AMBIENTALI DI GOOGLE GEMINI
 * ============================================================================
 */
export type GeminiModelErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_API_KEY'
  | 'QUOTA_EXHAUSTED'
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'SAFETY_BLOCKED'
  | 'RECITATION_BLOCKED'
  | 'CONTEXT_WINDOW_EXCEEDED'
  | 'NO_ACTION_SELECTED';

export type GeminiModelError =
  | {
      type: 'RATE_LIMIT_EXCEEDED';
      message: string;
      retryAfterMs?: number;
      status: 429;
    }
  | {
      type: 'INVALID_API_KEY';
      message: string;
      status: 400 | 401 | 403;
    }
  | {
      type: 'QUOTA_EXHAUSTED';
      message: string;
      status: number;
    }
  | {
      type: 'NETWORK_TIMEOUT';
      message: string;
      timeoutMs?: number;
    }
  | {
      type: 'NETWORK_ERROR';
      message: string;
      cause?: unknown;
    }
  | {
      type: 'SERVICE_UNAVAILABLE';
      message: string;
      status: number;
    }
  | {
      type: 'SAFETY_BLOCKED';
      message: string;
      finishReason: string;
      ratings?: unknown;
    }
  | {
      type: 'RECITATION_BLOCKED';
      message: string;
      finishReason: string;
    }
  | {
      type: 'CONTEXT_WINDOW_EXCEEDED';
      message: string;
    }
  | {
      type: 'NO_ACTION_SELECTED';
      message: string;
      rawResponseText?: string;
    };

/**
 * Configurazione per il reasoning interno dei modelli Gemini 3 e 4.
 * Tutti i campi sono opzionali e vengono applicati solo se specificati esplicitamente dall'utente.
 */
export interface GeminiThinkingOptions {
  /**
   * Livello di pensiero qualitativo (Gemini 3 e 4: MINIMAL, LOW, MEDIUM, HIGH).
   */
  thinkingLevel?: ThinkingLevel | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  /**
   * Budget numerico di token per retrocompatibilità.
   */
  thinkingBudget?: number;
  /**
   * Se specificato, indica se includere i pensieri intermedi nel payload di risposta.
   */
  includeThoughts?: boolean;
}

/**
 * Opzioni di generazione e inferenza per l'adapter Gemini.
 * Nessun valore viene assunto di default: vengono passate solo le opzioni fornite esplicitamente.
 */
export interface GeminiChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  /**
   * Configurazione reasoning/thinking (Gemini 3/4).
   */
  thinking?: GeminiThinkingOptions;
  /**
   * Timeout esplicito in millisecondi per singola chiamata di inferenza.
   * Se non specificato, nessun timeout artificiale viene applicato.
   */
  timeoutMs?: number;
}

/**
 * Metriche prestazionali estratte da usageMetadata di Gemini.
 */
export interface GeminiMetrics {
  promptTokens?: number;
  candidatesTokens?: number;
  totalTokens?: number;
  thoughtsTokens?: number;
  durationMs?: number;
}

export interface GeminiAdapterConfig {
  /**
   * API Key di Google AI Studio richiesta esplicitamente.
   */
  apiKey: string;
  /**
   * Nome del modello richiesto esplicitamente (es. 'gemini-3.5-flash', 'gemini-3.5-pro', 'gemini-4-argon').
   */
  model: string;
  /**
   * Opzioni di generazione opzionali.
   */
  options?: GeminiChatOptions;
  /**
   * Callback opzionale per metriche di latenza e token usage.
   */
  onMetrics?: (metrics: GeminiMetrics) => void;
}
