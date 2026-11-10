import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createRunner,
  FrameworkEngine,
  type UnexpectedModelError,
} from "@formal-agent/core";
import {
  createCareerLlamaAdapter,
  createCareerGeminiAdapter,
  type CreateCareerLlamaAdapterOptions,
  type CreateCareerGeminiAdapterOptions,
} from "./adapter.js";
import { careerAgent } from "./implementation.js";

// Motore invariante di transizione condiviso
const engine = new FrameworkEngine(createDefaultFrameworkConfig());

// Logger per stampare a video i passi dell'agente in linguaggio naturale
const consoleLogger = new ConsoleLogger({
  showThoughts: true,
  showState: false,
  showRoutineTransitions: false,
  useColors: true,
});

const defaultToolErrorRecovery = {
  w_leggi_pagina_web: async (error: { type: string }, context: { attempt: number }) => {
    if (error.type === 'NETWORK_TIMEOUT' && context.attempt < 3) {
      console.warn(`[Recovery Tool] Timeout lettura pagina web (tentativo ${context.attempt}), ritento...`);
      return { action: 'retry' as const };
    }
    return { action: 'abort' as const };
  },
  w_cerca_web: async (error: { type: string }, context: { attempt: number }) => {
    if (error.type === 'NETWORK_TIMEOUT' && context.attempt < 3) {
      console.warn(`[Recovery Tool] Timeout ricerca web (tentativo ${context.attempt}), ritento...`);
      return { action: 'retry' as const };
    }
    return { action: 'abort' as const };
  },
};

/**
 * ============================================================================
 * 1. RUNNER FORTEMENTE TIPIZZATO SU QWEN (LLAMA.CPP / SGLANG)
 * ============================================================================
 * Tutti i tipi degli errori del modello sono inferiti a tempo di compilazione.
 */
export function buildCareerQwenRunner(options?: CreateCareerLlamaAdapterOptions) {
  const qwenModel = createCareerLlamaAdapter(options);

  return createRunner({ defaultEngine: false })
    .withEngine(engine)
    .withModel(qwenModel)
    .withAgent(careerAgent)
    .withRecovery({
      onToolError: defaultToolErrorRecovery,
      onModelError(error: unknown, context) {
        const err = error as { type?: string; message?: string };
        console.error(`[Recovery Qwen] Errore modello: ${err?.type ?? 'UNKNOWN'} - ${err?.message ?? String(error)}`);
        return { action: "abort" };
      },
    })
    .withOptions({
      observers: [consoleLogger],
      maxMacroCycles: 25,
      maxTicks: 100,
    });
}

/**
 * ============================================================================
 * 2. RUNNER FORTEMENTE TIPIZZATO SU GOOGLE GEMINI (GEMINI 3 & 4)
 * ============================================================================
 * Gestisce l'intera discriminated union GeminiModelError a tempo di compilazione.
 */
export function buildCareerGeminiRunner(options: CreateCareerGeminiAdapterOptions) {
  const geminiModel = createCareerGeminiAdapter(options);

  return createRunner({ defaultEngine: false })
    .withEngine(engine)
    .withModel(geminiModel)
    .withAgent(careerAgent)
    .withRecovery({
      onToolError: defaultToolErrorRecovery,
      async onModelError(error, context) {
        switch (error.type) {
          case 'SERVICE_UNAVAILABLE':
          case 'RATE_LIMIT_EXCEEDED': {
            if (context.attempt < 4) {
              const retryAfterMs = error.type === 'RATE_LIMIT_EXCEEDED' ? error.retryAfterMs : undefined;
              const delay = retryAfterMs ?? (context.attempt * 2000);
              console.warn(
                `[Recovery Gemini] Modello temporaneamente non disponibile (${error.type}), attendo ${delay}ms prima del tentativo ${context.attempt + 1}...`
              );
              await new Promise((r) => setTimeout(r, delay));
              return { action: "retry" };
            }
            return { action: "abort" };
          }

          case 'NETWORK_TIMEOUT': {
            if (context.attempt < 3) {
              console.warn(`[Recovery Gemini] Timeout inferenza, ritento...`);
              return { action: "retry" };
            }
            return { action: "abort" };
          }

          case 'INVALID_API_KEY':
          case 'QUOTA_EXHAUSTED':
          case 'SAFETY_BLOCKED':
          case 'RECITATION_BLOCKED':
          case 'CONTEXT_WINDOW_EXCEEDED':
          case 'NETWORK_ERROR':
            console.error(`[Recovery Gemini] Errore non recuperabile: ${error.type} - ${error.message}`);
            return { action: "abort" };

          case 'UNEXPECTED_MODEL_ERROR':
          default:
            console.error(`[Recovery Gemini] Errore imprevisto del modello:`, error);
            return { action: "abort" };
        }
      },
    })
    .withOptions({
      observers: [consoleLogger],
      maxMacroCycles: 25,
      maxTicks: 100,
    });
}

/**
 * Runner di default pre-configurato con Qwen per test ed esecuzione locale.
 */
export const careerRunner = buildCareerQwenRunner();

/**
 * Funzione di esecuzione specializzata per Qwen / Llama-server.
 */
export async function searchCompanyCareersWithQwen(
  company: { name: string; description?: string },
  options?: CreateCareerLlamaAdapterOptions
) {
  const runner = buildCareerQwenRunner(options);
  const prompt = company.description
    ? `Trova la pagina carriere ufficiale dell'azienda "${company.name}". Informazioni di contesto: ${company.description}`
    : `Trova la pagina carriere ufficiale dell'azienda "${company.name}".`;

  return await runner.run({
    userContent: {
      kind: 'text',
      text: prompt,
    },
  });
}

/**
 * Funzione di esecuzione specializzata per Google Gemini.
 */
export async function searchCompanyCareersWithGemini(
  company: { name: string; description?: string },
  options: CreateCareerGeminiAdapterOptions
) {
  const runner = buildCareerGeminiRunner(options);
  const prompt = company.description
    ? `Trova la pagina carriere ufficiale dell'azienda "${company.name}". Informazioni di contesto: ${company.description}`
    : `Trova la pagina carriere ufficiale dell'azienda "${company.name}".`;

  return await runner.run({
    userContent: {
      kind: 'text',
      text: prompt,
    },
  });
}

/**
 * Entrypoint di convenienza che delega alla funzione corrispondente
 * in base alla configurazione esplicita presente nell'ambiente.
 */
export async function searchCompanyCareers(company: {
  name: string;
  description?: string;
}) {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL) {
    return await searchCompanyCareersWithGemini(company, {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
      timeoutMs: process.env.GEMINI_TIMEOUT_MS ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10) : undefined,
    });
  }

  return await searchCompanyCareersWithQwen(company, {
    baseUrl: process.env.LLAMA_BASE_URL,
    modelName: process.env.LLAMA_MODEL_NAME,
  });
}
