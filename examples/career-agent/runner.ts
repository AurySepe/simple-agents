import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createRunner,
  FrameworkEngine,
  type LanguageModelAdapter,
} from "@formal-agent/core";
import { createCareerLlamaAdapter, createCareerGeminiAdapter } from "./adapter.js";
import { careerAgent } from "./implementation.js";

/**
 * ============================================================================
 * CONFIGURAZIONE DEL RUNNER E DEL MODELLO (GEMINI / QWEN)
 * ============================================================================
 * Il runner supporta dinamicamente sia Google Gemini che Llama-server (Qwen).
 * Se GEMINI_API_KEY è configurata, utilizza il modello Gemini specificato (default: gemini-3.5-flash-lite).
 */

export function resolveDefaultModelAdapter(): LanguageModelAdapter {
  if (process.env.GEMINI_API_KEY) {
    return createCareerGeminiAdapter({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
      timeoutMs: process.env.GEMINI_TIMEOUT_MS ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10) : 60000,
    });
  }

  return createCareerLlamaAdapter({
    baseUrl: process.env.LLAMA_BASE_URL ?? "http://localhost:30000",
    modelName: process.env.LLAMA_MODEL_NAME ?? "qwen3.5-9b",
  });
}

// 1. Motore invariante di transizione
const engine = new FrameworkEngine(createDefaultFrameworkConfig());

// 2. Logger per stampare a video i passi dell'agente in linguaggio naturale
const consoleLogger = new ConsoleLogger({
  showThoughts: true,
  showState: false,
  showRoutineTransitions: false,
  useColors: true,
});

/**
 * Costruisce un runner per l'agente delle carriere con un adapter del modello specificato.
 */
export function buildCareerRunner(modelAdapter?: LanguageModelAdapter) {
  const model = modelAdapter ?? resolveDefaultModelAdapter();

  return createRunner({ defaultEngine: false })
    .withEngine(engine)
    .withModel(model)
    .withAgent(careerAgent)
    .withRecovery({
      onToolError: {
        w_leggi_pagina_web: async (error, context) => {
          if (error.type === 'NETWORK_TIMEOUT' && context.attempt < 3) {
            console.warn(`[Recovery] Timeout pagina web (tentativo ${context.attempt}), ritento...`);
            return { action: 'retry' };
          }
          return { action: 'abort' };
        },
        w_cerca_web: async (error, context) => {
          if (error.type === 'NETWORK_TIMEOUT' && context.attempt < 3) {
            console.warn(`[Recovery] Timeout ricerca web (tentativo ${context.attempt}), ritento...`);
            return { action: 'retry' };
          }
          return { action: 'abort' };
        },
      },
      async onModelError(error, context) {
        if ((error.type === 'SERVICE_UNAVAILABLE' || error.type === 'RATE_LIMIT_EXCEEDED') && context.attempt < 4) {
          const delay = (error as any).retryAfterMs ?? (context.attempt * 2000);
          console.warn(`[Recovery] Modello sovraccarico (${error.type}), attendo ${delay}ms prima del tentativo ${context.attempt + 1}...`);
          await new Promise((r) => setTimeout(r, delay));
          return { action: "retry" };
        }
        console.error(`[Recovery] Errore modello irreversibile: ${error.type ?? 'UNKNOWN'}`);
        return { action: "abort" };
      },
    })
    .withOptions({
      observers: [consoleLogger],
      maxMacroCycles: 25,
      maxTicks: 100,
    });
}

export const careerRunner = buildCareerRunner();

/**
 * Funzione di alto livello per avviare la ricerca carriere per un'azienda.
 *
 * @param company.name Nome dell'azienda target da investigare
 * @param company.description Descrizione o contesto opzionale per affinare la ricerca
 */
export async function searchCompanyCareers(company: {
  name: string;
  description?: string;
}) {
  const prompt = company.description
    ? `Trova la pagina carriere ufficiale dell'azienda "${company.name}". Informazioni di contesto: ${company.description}`
    : `Trova la pagina carriere ufficiale dell'azienda "${company.name}".`;

  return await careerRunner.run({
    userContent: {
      kind: 'text',
      text: prompt
    }
  });
}
