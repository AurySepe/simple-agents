import * as fs from 'fs';
import * as path from 'path';
import {
  createConsoleObserver,
  createDefaultFrameworkConfig,
  defaultItalianMarkdownProjector,
  defaultItalianPolicy,
  FrameworkEngine
} from '@formal-agent/core';
import { commercialManifest } from '../live-ollama/manifest.js';
import { commercialScenarios } from '../live-ollama/scenarios.js';
import { CommercialDatabaseState, createCommercialWorld } from '../live-ollama/world.js';
import { createLlamaCppQwenAdapter } from './adapter.js';

export interface RunCommercialAgentOptions {
  prompt?: string;
  database?: CommercialDatabaseState;
  scenarioId?: string;
}

/**
 * ============================================================================
 * RUNNER LLAMA-SERVER: ESECUZIONE LIVE CON VINCOLO GRAMMATICALE GBNF / TOOLS
 * ============================================================================
 */
export async function runCommercialAgent(optionsOrPrompt?: string | RunCommercialAgentOptions) {
  const options: RunCommercialAgentOptions =
    typeof optionsOrPrompt === 'string'
      ? { prompt: optionsOrPrompt }
      : (optionsOrPrompt ?? {});

  let scenario = options.scenarioId
    ? (commercialScenarios[options.scenarioId] ??
       Object.values(commercialScenarios)[parseInt(options.scenarioId, 10) - 1])
    : undefined;

  if (!scenario && !options.prompt) {
    scenario = commercialScenarios.scenario_1_successo_vip;
  }

  const prompt = options.prompt ?? scenario?.inputUtente ?? 'Buongiorno, vorrei informazioni sul mio ordine.';
  const database = options.database ?? scenario?.database;

  const logLines: string[] = [];
  const logDir = path.resolve('examples/live-llamacpp');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.resolve(logDir, 'last-run.log');

  const dualWriter = (msg: string) => {
    console.log(msg);
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
    logLines.push(cleanMsg);
  };

  dualWriter('='.repeat(80));
  dualWriter('   FRAMEWORK Ω: ESECUZIONE LIVE CON LLAMA-SERVER (CUDA + GBNF Tool Constraints)');
  if (scenario) {
    dualWriter(`   SCENARIO: ${scenario.titolo}`);
    dualWriter(`   ESITO ATTESO: [${scenario.esitoAtteso}]`);
  }
  dualWriter('='.repeat(80));

  // 1. Inizializzazione Livello 1 (Framework Engine)
  const framework = new FrameworkEngine(
    createDefaultFrameworkConfig({
      systemFrameProjector: defaultItalianMarkdownProjector,
      policy: defaultItalianPolicy
    })
  );

  // 2. Inizializzazione Livello 2 (Mondo Aziendale W con Database Parametrizzato)
  const world = createCommercialWorld(database);
  const runtime = framework.bindWorld(world);

  // 3. Inizializzazione Modello Linguistico M (llama-server con tool_choice='required')
  const model = createLlamaCppQwenAdapter({ writer: dualWriter });

  // 4. Inizializzazione Livello 3 (Spawning dell'Agente da Manifesto)
  const agent = runtime.spawnAgent(commercialManifest, model);

  // 5. Osservabilità (Tracciamento minimale con dual writer console + file)
  agent.addObserver(
    createConsoleObserver({
      writer: dualWriter
    })
  );

  try {
    const outcome = await agent.run({ userContent: prompt });

    switch (outcome.status) {
      case 'halt': {
        dualWriter('='.repeat(80));
        dualWriter('   ESECUZIONE COMPLETATA CON SUCCESSO!');
        dualWriter('='.repeat(80));
        dualWriter(`Macro-cicli impiegati: ${outcome.macroCycles}`);
        dualWriter(`Micro-tick decisionali: ${outcome.ticks}`);
        dualWriter(`Stato finale di controllo: ${agent.getControlState()}`);
        dualWriter(`Azione terminale scelta: ${outcome.result.type}`);
        if (scenario) {
          const match = outcome.result.type === scenario.esitoAtteso ? '✅ CONFORME' : '❌ DISCORDE';
          dualWriter(`Verifica rispetto all'atteso (${scenario.esitoAtteso}): ${match}`);
        }
        dualWriter(`Payload terminale:\n${JSON.stringify(outcome.result.payload, null, 2)}`);
        break;
      }
      case 'stall': {
        dualWriter('='.repeat(80));
        dualWriter('   ⚠️ AGENTE IN STALLO COGNITIVO (q_stall)');
        dualWriter('='.repeat(80));
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
    fs.writeFileSync(logFile, logLines.join('\n'), 'utf-8');
  }
}

// Supporto per esecuzione diretta da CLI: npx tsx examples/live-llamacpp/runner.ts [scenarioNum|id]
const arg = process.argv[2];
if (arg) {
  runCommercialAgent({ scenarioId: arg }).catch(() => process.exit(1));
} else if (process.argv[1]?.endsWith('runner.ts')) {
  runCommercialAgent().catch(() => process.exit(1));
}

