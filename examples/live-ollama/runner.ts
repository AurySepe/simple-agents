import {
  createConsoleObserver,
  createDefaultFrameworkConfig,
  FrameworkEngine
} from '../../src/index.js';
import { createOllamaQwenAdapter } from './adapter.js';
import { commercialManifest } from './manifest.js';
import { createCommercialWorld } from './world.js';

/**
 * ============================================================================
 * RUNNER: ESECUZIONE DEL MACRO-CICLO DELL'AGENTE
 * ============================================================================
 * Assembla i 3 livelli del Framework Ω e l'adattatore Ollama:
 * 1. FrameworkEngine (Livello 1 - OS FSM & Policy Italiana)
 * 2. World W (Livello 2 - Database Clienti e Ordini)
 * 3. Manifesto M_agent (Livello 3 - Modello di Business)
 * 4. Model Adapter (Ollama locale qwen3.5:9b)
 */
export async function runCommercialAgent(userPrompt?: string) {
  console.log('='.repeat(80));
  console.log('   FRAMEWORK Ω: ESECUZIONE LIVE CON OLLAMA E QWEN 3.5');
  console.log('='.repeat(80));

  // 1. Inizializzazione Livello 1 (Framework Engine con Policy Italiana e primitive cognitive)
  const framework = new FrameworkEngine(createDefaultFrameworkConfig());

  // 2. Inizializzazione Livello 2 (Mondo Aziendale W)
  const world = createCommercialWorld();
  const runtime = framework.bindWorld(world);

  // 3. Inizializzazione Modello Linguistico M (Ollama Locale)
  const model = createOllamaQwenAdapter();

  // 4. Inizializzazione Livello 3 (Spawning dell'Agente da Manifesto)
  const agent = runtime.spawnAgent(commercialManifest, model);

  // 5. Osservabilità (Tracciamento dei cambi di stato della FSM a terminale)
  agent.addObserver(createConsoleObserver());

  // 6. Esecuzione del Macro-Ciclo
  const prompt =
    userPrompt ??
    'Buongiorno, sono il cliente 42 (Mario Rossi). Vorrei sapere se posso avere lo sconto sul mio ordine in corso e a quanto ammonterebbe il totale.';

  console.log(`\n💬 INPUT UTENTE: "${prompt}"\n`);

  try {
    const outcome = await agent.run({ userContent: prompt });

    console.log('\n' + '='.repeat(80));
    console.log('   ESECUZIONE COMPLETATA CON SUCCESSO!');
    console.log('='.repeat(80));
    console.log(`Macro-cicli impiegati: ${outcome.macroCycles}`);
    console.log(`Micro-tick decisionali: ${outcome.ticks}`);
    console.log(`Stato finale di controllo: ${agent.getControlState()}`);
    console.log('\n📦 PAYLOAD STRUTTURATO DI HALT (A_term):');
    console.log(JSON.stringify(outcome.result, null, 2));

    return outcome;
  } catch (error) {
    console.error('\n❌ ERRORE DURANTE L ESECUZIONE DELL AGENTE:', error);
    throw error;
  }
}

// Esecuzione diretta se invocato come script principale
if (process.argv[1]?.endsWith('runner.ts') || process.argv[1]?.endsWith('runner.js')) {
  runCommercialAgent().catch((err) => {
    console.error('Fatal:', err);
  });
}

