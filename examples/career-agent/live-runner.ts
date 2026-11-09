import * as fs from "fs";
import * as path from "path";
import {
  createConsoleObserver,
  createDefaultFrameworkConfig,
  defaultItalianMarkdownProjector,
  defaultItalianPolicy,
  FrameworkEngine,
} from "@formal-agent/core";
import { careerAgentManifest } from "./manifest.js";
import { createLiveCareerWorld, LiveWebWorldClient } from "./live-world.js";
import { createCareerLlamaAdapter } from "./adapter.js";

export interface RunLiveCareerAgentOptions {
  azienda: string;
  descrizione?: string;
  maxResults?: number;
}

/**
 * ============================================================================
 * RUNNER LIVE ONLINE: RICERCA WEB REALE DI PAGINE CARRIERE AZIENDALI
 * ============================================================================
 * Utilizza:
 * - Framework Formale Ω con proiezioni e policy italiane
 * - llama-server (Qwen 3.5 9B su CUDA con grammatiche GBNF)
 * - DuckDuckGo HTML scraping e fetch HTTP reali con Cheerio
 */
export async function runLiveCareerAgent(optionsOrAzienda: string | RunLiveCareerAgentOptions) {
  const options: RunLiveCareerAgentOptions =
    typeof optionsOrAzienda === "string"
      ? { azienda: optionsOrAzienda }
      : optionsOrAzienda;

  const azienda = options.azienda.trim();
  const descrizione = options.descrizione?.trim();

  const userPrompt = descrizione
    ? `Trova la pagina carriere ufficiale dell'azienda "${azienda}" (${descrizione}), dove sono elencate le posizioni lavorative aperte.`
    : `Trova la pagina carriere ufficiale dell'azienda "${azienda}", dove sono elencate le posizioni lavorative aperte.`;

  const logLines: string[] = [];
  const logDir = path.resolve("examples/career-agent");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.resolve(logDir, "last-live-run.log");

  const dualWriter = (msg: string) => {
    console.log(msg);
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, "");
    logLines.push(cleanMsg);
  };

  dualWriter("=".repeat(80));
  dualWriter("   FRAMEWORK Ω: AGENTE INVESTIGATORE CARRIERE - ESECUZIONE SUL WEB REALE");
  dualWriter("   ENGINE: llama-server (Qwen 3.5 9B CUDA + GBNF Tool Constraints)");
  dualWriter(`   AZIENDA TARGET: "${azienda}"`);
  if (descrizione) {
    dualWriter(`   DESCRIZIONE/SETTORE: "${descrizione}"`);
  }
  dualWriter("   CONNESSIONE: Live Internet (DuckDuckGo Search + Real HTTP Fetch)");
  dualWriter("=".repeat(80));

  // 1. Inizializzazione Framework Engine (Livello 1)
  const framework = new FrameworkEngine(
    createDefaultFrameworkConfig({
      systemFrameProjector: defaultItalianMarkdownProjector,
      policy: defaultItalianPolicy,
    })
  );

  // 2. Inizializzazione Mondo Web REALE (Livello 2)
  const client = new LiveWebWorldClient({
    defaultMaxResults: options.maxResults ?? 5,
  });
  const world = createLiveCareerWorld(client);
  const runtime = framework.bindWorld(world);

  // 3. Inizializzazione Modello Linguistico M (llama-server)
  const model = createCareerLlamaAdapter({ writer: dualWriter });

  // 4. Inizializzazione Agente da Manifesto (Livello 3)
  const agent = runtime.spawnAgent(careerAgentManifest, model);

  // 5. Osservabilità (dual-writer console + last-live-run.log)
  agent.addObserver(
    createConsoleObserver({
      writer: dualWriter,
    })
  );

  try {
    dualWriter(`\n👤 Richiesta Utente: "${userPrompt}"\n`);
    const outcome = await agent.run({ userContent: userPrompt });

    dualWriter("=".repeat(80));
    dualWriter("   INVESTIGAZIONE WEB REALE COMPLETATA!");
    dualWriter("=".repeat(80));
    dualWriter(`Macro-cicli impiegati: ${outcome.macroCycles}`);
    dualWriter(`Micro-tick decisionali: ${outcome.ticks}`);
    dualWriter(`Stato finale di controllo: ${agent.getControlState()}`);
    if (outcome.status === "halt") {
      dualWriter(`Azione terminale scelta: ${outcome.result.type}`);
      dualWriter(`Payload terminale:\n${JSON.stringify(outcome.result.payload, null, 2)}`);
    } else {
      dualWriter(`Stallo di deliberazione: ${outcome.stall.reason}`);
      dualWriter(`Dettagli stallo:\n${JSON.stringify(outcome.stall, null, 2)}`);
    }

    return outcome;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.stack ?? err.message : String(err);
    dualWriter(`\n❌ ERRORE DURANTE LA NAVIGAZIONE WEB DELL'AGENTE: ${errMsg}`);
    throw err;
  } finally {
    fs.writeFileSync(logFile, logLines.join("\n"), "utf-8");
  }
}

// Supporto esecuzione diretta da CLI:
// npx tsx examples/career-agent/live-runner.ts "Nome Azienda" ["Descrizione opzionale"]
const args = process.argv.slice(2);
if (args.length > 0) {
  const aziendaArg = args[0];
  const descrArg = args[1];
  runLiveCareerAgent({ azienda: aziendaArg, descrizione: descrArg }).catch(() => process.exit(1));
} else if (process.argv[1]?.endsWith("live-runner.ts")) {
  // Esempio reale di default: Satispay (Fintech italiana nota)
  runLiveCareerAgent({
    azienda: "Satispay",
    descrizione: "Piattaforma di pagamenti digitali e smart payment italiana",
  }).catch(() => process.exit(1));
}

