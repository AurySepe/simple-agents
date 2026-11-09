import * as fs from 'fs';
import * as path from 'path';
import {
  createConsoleObserver,
  createDefaultFrameworkConfig,
  defaultItalianMarkdownProjector,
  defaultItalianPolicy,
  FrameworkEngine
} from '@formal-agent/core';
import { createOllamaQwenAdapter } from './adapter.js';
import { commercialManifest } from './manifest.js';
import { commercialScenarios } from './scenarios.js';
import { CommercialDatabaseState, createCommercialWorld } from './world.js';

export interface RunCommercialAgentOptions {
  prompt?: string;
  database?: CommercialDatabaseState;
  scenarioId?: string;
}

/**
 * ============================================================================
 * RUNNER: ESECUZIONE DEL MACRO-CICLO DELL'AGENTE SU SCENARIO
 * ============================================================================
 * Supporta la parametrizzazione del database e la selezione degli scenari.
 */
export async function runCommercialAgent(optionsOrPrompt?: string | RunCommercialAgentOptions) {
  const options: RunCommercialAgentOptions =
    typeof optionsOrPrompt === 'string'
      ? { prompt: optionsOrPrompt }
      : (optionsOrPrompt ?? {});

  // Risoluzione scenario (se specificato come ID o numero 1-6)
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
  const logFile = path.resolve('examples/live-ollama/last-run.log');

  const dualWriter = (msg: string) => {
    console.log(msg);
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');
    logLines.push(cleanMsg);
  };

  dualWriter('='.repeat(80));
  dualWriter('   FRAMEWORK Ω: ESECUZIONE LIVE CON OLLAMA E QWEN 3.5');
  if (scenario) {
    dualWriter(`   SCENARIO: ${scenario.titolo}`);
    dualWriter(`   ESITO ATTESO: [${scenario.esitoAtteso}]`);
  }
  dualWriter('='.repeat(80));

  // 1. Inizializzazione Livello 1 (Framework Engine con Frame e Policy in Italiano)
  const framework = new FrameworkEngine(
    createDefaultFrameworkConfig({
      systemFrameProjector: defaultItalianMarkdownProjector,
      policy: defaultItalianPolicy
    })
  );

  // 2. Inizializzazione Livello 2 (Mondo Aziendale W con Database Parametrizzato)
  const world = createCommercialWorld(database);
  const runtime = framework.bindWorld(world);

  // 3. Inizializzazione Modello Linguistico M (Ollama Locale con dualWriter)
  const model = createOllamaQwenAdapter({ writer: dualWriter });

  // 4. Inizializzazione Livello 3 (Spawning dell'Agente da Manifesto)
  const agent = runtime.spawnAgent(commercialManifest, model);

  // 5. Osservabilità (Tracciamento minimale con dual writer console + file)
  agent.addObserver(
    createConsoleObserver({
      writer: dualWriter
    })
  );

  try {
    const outcome = await agent.run({
      userContent: {
        kind: 'text',
        text: prompt
      }
    });

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
        dualWriter('\n📦 PAYLOAD STRUTTURATO DI HALT (A_term):');
        dualWriter(JSON.stringify(outcome.result, null, 2));
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

    // Scrive su disco last-run.log
    fs.writeFileSync(logFile, logLines.join('\n') + '\n', 'utf8');
    console.log(`\n📄 Log completo salvato in: ${logFile}\n`);

    return outcome;
  } catch (error) {
    const errorMsg = `\n❌ ERRORE DURANTE L ESECUZIONE DELL AGENTE: ${String(error)}`;
    dualWriter(errorMsg);
    fs.writeFileSync(logFile, logLines.join('\n') + '\n', 'utf8');
    console.error(errorMsg);
    throw error;
  }
}

// Esecuzione diretta se invocato come script principale
if (process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js')) {
  const scenarioArg = process.argv[2];
  runCommercialAgent({ scenarioId: scenarioArg }).catch((err) => {
    console.error('Fatal:', err);
  });
}
