import type { DataRecord } from '@formal-agent/core';
import type { FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';

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
  | 'CONTEXT_WINDOW_EXCEEDED';

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
      timeoutMs: number;
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
    };

/**
 * Configurazione per il reasoning interno dei modelli Gemini 3 e 4.
 */
export interface GeminiThinkingOptions {
  /**
   * Livello di pensiero qualitativo (Gemini 3 e 4: MINIMAL, LOW, MEDIUM, HIGH).
   */
  thinkingLevel?: ThinkingLevel | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  /**
   * Budget numerico di token per retrocompatibilità (Gemini 2.5).
   * Mutuamente esclusivo con thinkingLevel.
   */
  thinkingBudget?: number;
  /**
   * Se true, estrae e restituisce i pensieri intermedi nel campo `thought` di ModelOutput.
   * Default: true.
   */
  includeThoughts?: boolean;
}

/**
 * Opzioni di generazione e inferenza per l'adapter Gemini.
 */
export interface GeminiChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  /**
   * Modalità di function calling:
   * - 'required' / 'ANY': costringe il modello a invocare sempre un tool se disponibili
   * - 'auto' / 'AUTO': lascia libera scelta al modello
   * - 'none' / 'NONE': disattiva il tool calling
   */
  toolChoice?: 'required' | 'auto' | 'none' | FunctionCallingConfigMode;
  /**
   * Configurazione reasoning/thinking (Gemini 3/4).
   */
  thinking?: GeminiThinkingOptions;
  /**
   * Timeout in millisecondi per singola chiamata di inferenza (default: 60000).
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
   * API Key di Google AI Studio (default: process.env.GEMINI_API_KEY).
   */
  apiKey?: string;
  /**
   * Nome del modello (es. 'gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-4-argon').
   * Default: 'gemini-3.5-flash'.
   */
  model?: string;
  /**
   * Opzioni di generazione predefinite.
   */
  options?: GeminiChatOptions;
  /**
   * Callback opzionale per metriche di latenza e token usage.
   */
  onMetrics?: (metrics: GeminiMetrics) => void;
}
