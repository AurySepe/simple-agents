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
import { CAREER_SCENARIOS, type CareerScenario } from "./scenarios.js";
import { createCareerWorld, MockWebWorldClient } from "./world.js";
import { createCareerLlamaAdapter } from "./adapter.js";

export interface RunCareerAgentOptions {
  scenarioId?: number | string;
  userPrompt?: string;
  customWorldClient?: MockWebWorldClient;
}

/**
 * ============================================================================
 * RUNNER: AGENTE INVESTIGATORE WEB (LLAMA-SERVER + CHEERIO + MONDO MOCCATO)
 * ============================================================================
 */
export async function runCareerAgent(optionsOrScenario?: number | string | RunCareerAgentOptions) {
  const options: RunCareerAgentOptions =
    typeof optionsOrScenario === "number" || typeof optionsOrScenario === "string"
      ? { scenarioId: optionsOrScenario }
      : (optionsOrScenario ?? {});

  let scenario: CareerScenario | undefined;

  if (options.scenarioId !== undefined) {
    const numericId =
      typeof options.scenarioId === "number"
        ? options.scenarioId
        : parseInt(options.scenarioId, 10);
    scenario = CAREER_SCENARIOS.find((s) => s.id === numericId);
  }

  // Di default esegue lo scenario 1 se non specificato
  if (!scenario && !options.userPrompt) {
    scenario = CAREER_SCENARIOS[0];
  }

  const prompt =
    options.userPrompt ??
    scenario?.richiestaUtente ??
    "Trova la pagina carriere ufficiale dell'azienda Acme Corp.";

  const logLines: string[] = [];
  const logDir = path.resolve("examples/career-agent");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.resolve(logDir, "last-run.log");

  const dualWriter = (msg: string) => {
    console.log(msg);
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, "");
    logLines.push(cleanMsg);
  };

  dualWriter("=".repeat(80));
  dualWriter("   FRAMEWORK Ω: AGENTE INVESTIGATORE CARRIERE WEB");
  dualWriter("   ENGINE: llama-server (Qwen 3.5 9B CUDA + GBNF Tool Constraints)");
  if (scenario) {
    dualWriter(`   SCENARIO ${scenario.id}: ${scenario.titolo}`);
    dualWriter(`   AZIENDA TARGET: ${scenario.azienda}`);
    dualWriter(`   ESITO ATTESO: [${scenario.azioneTerminaleAttesa}]`);
  }
  dualWriter("=".repeat(80));

  // 1. Inizializzazione Framework Engine (Livello 1)
  const framework = new FrameworkEngine(
    createDefaultFrameworkConfig({
      systemFrameProjector: defaultItalianMarkdownProjector,
      policy: defaultItalianPolicy,
    })
  );

  // 2. Inizializzazione Mondo Web Moccato (Livello 2)
  const world = createCareerWorld(options.customWorldClient);
  const runtime = framework.bindWorld(world);

  // 3. Inizializzazione Modello Linguistico M (llama-server)
  const model = createCareerLlamaAdapter({ writer: dualWriter });

  // 4. Inizializzazione Agente da Manifesto (Livello 3)
  const agent = runtime.spawnAgent(careerAgentManifest, model);

  // 5. Osservabilità
  agent.addObserver(
    createConsoleObserver({
      writer: dualWriter,
    })
  );

  try {
    dualWriter(`\n👤 Richiesta Utente: "${prompt}"\n`);
    const outcome = await agent.run({ userContent: prompt });

    switch (outcome.status) {
      case "halt": {
        dualWriter("=".repeat(80));
        dualWriter("   RICERCA COMPLETATA CON SUCCESSO!");
        dualWriter("=".repeat(80));
        dualWriter(`Macro-cicli impiegati: ${outcome.macroCycles}`);
        dualWriter(`Micro-tick decisionali: ${outcome.ticks}`);
        dualWriter(`Stato finale di controllo: ${agent.getControlState()}`);
        dualWriter(`Azione terminale scelta: ${outcome.result.type}`);
        if (scenario) {
          const match =
            outcome.result.type === scenario.azioneTerminaleAttesa
              ? "✅ CONFORME"
              : "❌ DISCORDE";
          dualWriter(`Verifica rispetto all'atteso (${scenario.azioneTerminaleAttesa}): ${match}`);
        }
        dualWriter(`Payload terminale:\n${JSON.stringify(outcome.result.payload, null, 2)}`);
        break;
      }
      case "stall": {
        dualWriter("=".repeat(80));
        dualWriter("   ⚠️ AGENTE TERMINATO IN STALLO COGNITIVO (q_stall)");
        dualWriter("=".repeat(80));
        dualWriter(`Macro-cicli impiegati: ${outcome.macroCycles}`);
        dualWriter(`Micro-tick decisionali: ${outcome.ticks}`);
        dualWriter(`Stato finale di controllo: ${agent.getControlState()}`);
        dualWriter(`Motivo dello stallo: ${outcome.stall.reason}`);
        dualWriter(`Dettaglio: ${outcome.stall.message}`);
        break;
      }
    }

    return outcome;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.stack ?? err.message : String(err);
    dualWriter(`\n❌ ERRORE DURANTE L'ESECUZIONE DELL'AGENTE: ${errMsg}`);
    throw err;
  } finally {
    fs.writeFileSync(logFile, logLines.join("\n"), "utf-8");
  }
}

// Supporto per esecuzione diretta da riga di comando:
// npx tsx examples/career-agent/runner.ts [scenarioId: 1, 2, 3 o 4]
const arg = process.argv[2];
if (arg) {
  runCareerAgent(arg).catch(() => process.exit(1));
} else if (process.argv[1]?.endsWith("runner.ts")) {
  runCareerAgent(1).catch(() => process.exit(1));
}

