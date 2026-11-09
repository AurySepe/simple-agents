import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createRunner,
  defaultItalianMarkdownProjector,
  defaultItalianPolicy,
  FrameworkEngine,
} from "@formal-agent/core";
import { createCareerLlamaAdapter } from "./adapter.js";
import { careerAgent } from "./implementation.js";

/**
 * ============================================================================
 * CONFIGURAZIONE DEL RUNNER E DEL MODELLO QWEN
 * ============================================================================
 * Il runner è pre-configurato con:
 * - FrameworkEngine (Livello 1) con policy e proiettore Markdown italiano
 * - Modello Qwen via llama-server (con vincolo grammaticale GBNF sui tool)
 * - ConsoleLogger (per stampare i passi dell'agente in tempo reale in console)
 * - Agente delle carriere già collegato e pronto
 */

// 1. Motore invariante di transizione
const engine = new FrameworkEngine(
  createDefaultFrameworkConfig({
    systemFrameProjector: defaultItalianMarkdownProjector,
    policy: defaultItalianPolicy,
  })
);

// 2. Modello linguistico Qwen (llama-server su porta 30000 o da variabile d'ambiente)
const qwenModel = createCareerLlamaAdapter({
  baseUrl: process.env.LLAMA_BASE_URL ?? "http://localhost:30000",
  modelName: process.env.LLAMA_MODEL_NAME ?? "qwen3.5-9b",
});

// 3. Logger per stampare a video i passi dell'agente in linguaggio naturale
const consoleLogger = new ConsoleLogger({
  showThoughts: true,
  showState: false,
  showRoutineTransitions: false,
  useColors: true,
});

// 4. Runner pronto e collegato all'agente
export const careerRunner = createRunner({ defaultEngine: false })
  .withEngine(engine)
  .withModel(qwenModel)
  .withAgent(careerAgent)
  .withOptions({
    observers: [consoleLogger],
    maxMacroCycles: 25,
    maxTicks: 100,
  });

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

  return await careerRunner.run({ userContent: prompt });
}
