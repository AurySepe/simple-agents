import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import {
  AgentManifest,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  InMemoryTelemetryCollector,
  LanguageModelAdapter,
  ModularAuditExporter,
  WorldTool
} from '../src/index.js';

describe('Test Esportazione JSON dello Stato ad Ogni Fase', () => {
  it('dovrebbe generare un JSON completo e ispezionabile con i valori dello stato (Ms, Ds, Ta, Ka, Ep) ad ogni fase dell\'esecuzione', async () => {
    // 1. Setup Framework e Mondo W
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());

    const worldDatabase: Record<number, { ordine_id: string; totale: number }> = {
      42: { ordine_id: 'ORD-42', totale: 300.0 }
    };

    const dbTool: WorldTool = {
      id: 'w_db_ordini',
      description: 'Recupera ordine da database',
      parameters: z.object({ cliente_id: z.number() }),
      execute: async ({ cliente_id }) => worldDatabase[cliente_id]
    };

    const scontoTool: WorldTool = {
      id: 'w_applica_sconto',
      description: 'Applica sconto',
      parameters: z.object({ ordine_id: z.string(), percentuale: z.number() }),
      execute: async ({ ordine_id, percentuale }) => ({
        ordine_id,
        percentuale,
        esito: 'APPLICATO'
      })
    };

    const world = createWorldRegistry([dbTool, scontoTool]);
    const runtime = framework.bindWorld(world);

    // 2. Manifesto dell'Agente con stato iniziale
    const manifest: AgentManifest = {
      I: 'Agente Commerciale Audit',
      Ms0: 'Elaborare ordine e applicare sconto',
      Ds0: { anno: 2026, valuta: 'EUR' },
      Ta0: ['w_db_ordini', 'w_applica_sconto'],
      A_term: [
        {
          id: 'a_concluso',
          description: 'Terminazione con successo',
          schema: z.object({ ordine_id: z.string(), concluso: z.boolean() })
        }
      ]
    };

    // 3. Modello deterministico multi-fase
    let step = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        step++;

        // PASSO 1: Esegue la query al DB del Mondo W
        if (step === 1) {
          return {
            thought: 'Fase 1: Interrogo il database per il cliente 42.',
            calls: [{ id: 'c1', name: 'w_db_ordini', payload: { cliente_id: 42 } }]
          };
        }

        // PASSO 2: Ricevuto esito dal Mondo, applica sconto
        if (step === 2) {
          return {
            thought: 'Fase 2: Ordine ORD-42 trovato, applico sconto del 10%.',
            calls: [
              {
                id: 'c2',
                name: 'w_applica_sconto',
                payload: { ordine_id: 'ORD-42', percentuale: 10 }
              }
            ]
          };
        }

        // PASSO 3: Sconto applicato, emette contratto di terminazione
        if (step === 3) {
          return {
            thought: 'Fase 3: Sconto applicato con successo, termino con a_concluso.',
            calls: [
              {
                id: 'c3',
                name: 'a_concluso',
                payload: { ordine_id: 'ORD-42', concluso: true }
              }
            ]
          };
        }

        throw new Error(`Passo inatteso: ${step}`);
      }
    };

    // 4. Esecuzione con il Telemetry Collector in memoria
    const collector = new InMemoryTelemetryCollector();

    const runResult = await runtime.runAgent(manifest, model, {
      userContent: { kind: 'text', text: 'Elabora ordine cliente 42' },
      observers: [collector]
    });

    expect(runResult.status).toBe('halt');
    if (runResult.status !== 'halt') throw new Error('Expected halt');
    expect(runResult.result.type).toBe('a_concluso');

    // 5. Generazione ed esportazione della timeline dello stato in formato JSON
    const stateTimelineJSON = collector.exportStateTimelineJSON();
    expect(typeof stateTimelineJSON).toBe('string');

    // Salvataggio su file per ispezione diretta
    const scratchDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const outputPath = path.join(scratchDir, 'agent-state-timeline.json');
    fs.writeFileSync(outputPath, stateTimelineJSON, 'utf8');

    // 6. Parsing e Verifica puntuale di tutti i valori dello stato ad ogni fase
    const timeline = JSON.parse(stateTimelineJSON);

    // Deve aver registrato tutti i 3 passi decisionali
    expect(timeline).toHaveLength(3);

    // --- FASE 1: Passo 1 ---
    const step1 = timeline[0];
    expect(step1.step).toBe(1);
    expect(step1.macroCycle).toBe(0);
    expect(step1.phase).toBe('q_exec');
    expect(step1.state.Ms).toBe('Elaborare ordine e applicare sconto');
    expect(step1.state.Ds).toEqual({ anno: 2026, valuta: 'EUR' });
    expect(step1.state.Ta).toEqual(['w_db_ordini', 'w_applica_sconto']);
    expect(step1.thought).toContain('Fase 1');
    expect(step1.calls[0].name).toBe('w_db_ordini');
    expect(step1.calls[0].payload).toEqual({ cliente_id: 42 });

    // --- FASE 2: Passo 2 ---
    const step2 = timeline[1];
    expect(step2.step).toBe(2);
    expect(step2.macroCycle).toBe(1);
    expect(step2.phase).toBe('q_exec');
    expect(step2.state.Ta).toEqual(['w_db_ordini', 'w_applica_sconto']);
    expect(step2.calls[0].name).toBe('w_applica_sconto');

    // --- FASE 3: Passo 3 ---
    const step3 = timeline[2];
    expect(step3.step).toBe(3);
    expect(step3.macroCycle).toBe(2);
    expect(step3.phase).toBe('q_exec');
    expect(step3.calls[0].name).toBe('a_concluso');
    expect(step3.calls[0].payload).toEqual({ ordine_id: 'ORD-42', concluso: true });

    // 7. Verifica anche toJSON() completo con serializzazione corretta di Set e Map
    const fullEventsJSON = collector.toJSON();
    const parsedEvents = JSON.parse(fullEventsJSON);
    expect(Array.isArray(parsedEvents)).toBe(true);

    const inferenceEvents = parsedEvents.filter((e: any) => e.type === 'model_inference');
    expect(inferenceEvents).toHaveLength(3);
    expect(Array.isArray(inferenceEvents[0].stateSnapshot.Ta)).toBe(true);
    expect(inferenceEvents[0].stateSnapshot.Ta).toContain('w_db_ordini');
  });

  it('dovrebbe esportare la struttura modulare divisa per Fasi FSM e per Step con ModularAuditExporter', () => {
    // 1. Setup collector con eventi simulati
    const collector = new InMemoryTelemetryCollector();

    collector.onEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: 0,
      tick: 0,
      controlState: 'q_exec',
      context: {
        systemFrame: 'System Prompt F_Omega',
        messages: [
          { index: 0, tau: { c: 0, t: 0 }, type: 'stimulus', content: { kind: 'text', text: 'Richiesta di test' } }
        ],
        visibleTools: []
      },
      output: {
        thought: 'Penso ed eseguo calcolo',
        calls: [{ id: 'c1', name: 'tool_test', payload: { query: 'test' } }]
      },
      durationMs: 50,
      stateSnapshot: {
        I: 'Agente Test',
        Ms: 'Scopo Test',
        Ds: { k: 'v' },
        Ta: new Set(['tool_test']),
        Ka: new Map(),
        Ep: []
      }
    });

    collector.onEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: 1,
      tick: 1,
      controlState: 'q_exec',
      context: {
        systemFrame: 'System Prompt F_Omega Exec 2',
        messages: [],
        visibleTools: []
      },
      output: {
        thought: 'Concludo operazione',
        calls: [{ id: 'c2', name: 'termina', payload: { param: 123 } }]
      },
      durationMs: 40,
      stateSnapshot: {
        I: 'Agente Test',
        Ms: 'Scopo Test',
        Ds: { k: 'v' },
        Ta: new Set(['tool_test']),
        Ka: new Map(),
        Ep: []
      }
    });

    const testExportDir = path.resolve(process.cwd(), 'scratch', 'test-modular-audit');
    const result = ModularAuditExporter.export(collector, {
      outputDir: testExportDir,
      scenarioName: 'Test Modular Export',
      generateHtmlDashboard: true
    });

    expect(result.phasesCount).toBe(2);
    expect(result.stepsCount).toBe(2);

    // Verifica esistenza file generati
    expect(fs.existsSync(path.join(testExportDir, 'index.json'))).toBe(true);
    expect(fs.existsSync(path.join(testExportDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(testExportDir, 'phases'))).toBe(true);

    const indexContent = JSON.parse(fs.readFileSync(path.join(testExportDir, 'index.json'), 'utf8'));
    expect(indexContent.scenario).toBe('Test Modular Export');
    expect(indexContent.statisticheGenerali.totalePassi).toBe(2);
    expect(indexContent.statisticheGenerali.totaleFasiFSM).toBe(2);

    // Verifica step_01.json
    const step1File = path.join(testExportDir, indexContent.mappaFasiFSM[0].filePassi[0]);
    expect(fs.existsSync(step1File)).toBe(true);
    const step1Data = JSON.parse(fs.readFileSync(step1File, 'utf8'));
    expect(step1Data.coordinate.stepNumber).toBe(1);
    expect(step1Data.inputGrezzoPassatoAlModello.systemFrame).toBe('System Prompt F_Omega');
    expect(step1Data.inputGrezzoPassatoAlModello.messagesHistory[0].content).toEqual({ kind: 'text', text: 'Richiesta di test' });
    expect(step1Data.outputGrezzoDalModello.thought).toBe('Penso ed eseguo calcolo');
    expect(step1Data.outputGrezzoDalModello.calls[0].payload).toEqual({ query: 'test' });
  });
});
