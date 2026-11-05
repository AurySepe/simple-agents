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
      Ms0: 'In attesa di richieste da elaborare',
      Ds0: { anno: 2026, valuta: 'EUR' },
      A_int: [
        'aggiorna_missione',
        'imposta_dato',
        'carica_tool',
        'carica_concetto'
      ],
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

        // PASSO 1 (Intro): Aggiorna la missione e carica il tool w_db_ordini
        if (step === 1) {
          return {
            thought: 'Fase Intro 1: Aggiorno lo scopo e carico il tool per consultare il DB.',
            calls: [
              {
                id: 'c1',
                name: 'aggiorna_missione',
                payload: { nuovo_scopo: 'Verificare ordine cliente 42' }
              },
              {
                id: 'c2',
                name: 'carica_tool',
                payload: { tool_ids: ['w_db_ordini'] }
              }
            ]
          };
        }

        // PASSO 2 (Intro): Conclude l'introspezione iniziale
        if (step === 2) {
          return {
            thought: 'Fase Intro 2: Preparazione conclusa, passo alla fase operativa.',
            calls: [{ id: 'c3', name: 'a_concludi_intro', payload: {} }]
          };
        }

        // PASSO 3 (Exec): Esegue la query al DB del Mondo W
        if (step === 3) {
          return {
            thought: 'Fase Exec 1: Interrogo il database per il cliente 42.',
            calls: [{ id: 'c4', name: 'w_db_ordini', payload: { cliente_id: 42 } }]
          };
        }

        // PASSO 4 (Intro Macro-Ciclo 2): Ricevuto esito dal Mondo, salva il dato in Ds e conclude
        if (step === 4) {
          return {
            thought: 'Fase Intro 3: Ricevuto ordine ORD-42 dal mondo, salvo in memoria Ds.',
            calls: [
              {
                id: 'c5',
                name: 'imposta_dato',
                payload: { chiave: 'ordine_trovato', valore: { id: 'ORD-42', totale: 300 } }
              }
            ]
          };
        }

        // PASSO 5 (Intro Macro-Ciclo 2): Conclude intro
        if (step === 5) {
          return {
            thought: 'Fase Intro 4: Dato memorizzato, passo alla chiusura operativa.',
            calls: [{ id: 'c6', name: 'a_concludi_intro', payload: {} }]
          };
        }

        // PASSO 6 (Exec Macro-Ciclo 2): Emette contratto di terminazione
        if (step === 6) {
          return {
            thought: 'Fase Exec 2: Termino con il contratto a_concluso.',
            calls: [
              {
                id: 'c7',
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
      userContent: 'Elabora ordine cliente 42',
      observers: [collector]
    });

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

    // Deve aver registrato tutti i 6 passi decisionali
    expect(timeline).toHaveLength(6);

    // --- FASE 1: Passo 1 (Pianificazione interna iniziale) ---
    const step1 = timeline[0];
    expect(step1.step).toBe(1);
    expect(step1.phase).toBe('q_intro');
    expect(step1.directive).toBe('start_intro');
    expect(step1.state.Ms).toBe('In attesa di richieste da elaborare'); // Scopo iniziale Ms0
    expect(step1.state.Ds).toEqual({ anno: 2026, valuta: 'EUR' });     // Memoria iniziale Ds0
    expect(step1.state.Ta).toEqual([]);                                // Ta0 iniziale vuoto
    expect(step1.thought).toContain('Fase Intro 1');
    expect(step1.calls.map((c: any) => c.name)).toEqual(['aggiorna_missione', 'carica_tool']);

    // --- FASE 2: Passo 2 (Pianificazione interna dopo modifiche) ---
    const step2 = timeline[1];
    expect(step2.step).toBe(2);
    expect(step2.phase).toBe('q_intro');
    expect(step2.directive).toBe('loop_intro');
    // Verifica che lo scopo Ms sia stato aggiornato dal passo precedente
    expect(step2.state.Ms).toBe('Verificare ordine cliente 42');
    // Verifica che il tool 'w_db_ordini' sia stato montato in Ta
    expect(step2.state.Ta).toEqual(['w_db_ordini']);
    expect(step2.calls[0].name).toBe('a_concludi_intro');

    // --- FASE 3: Passo 3 (Azione operativa nel Mondo) ---
    const step3 = timeline[2];
    expect(step3.step).toBe(3);
    expect(step3.phase).toBe('q_exec');
    expect(step3.directive).toBe('start_exec');
    expect(step3.state.Ms).toBe('Verificare ordine cliente 42');
    expect(step3.state.Ta).toEqual(['w_db_ordini']);
    expect(step3.calls[0].name).toBe('w_db_ordini');
    expect(step3.calls[0].payload).toEqual({ cliente_id: 42 });

    // --- FASE 4: Passo 4 (Nuovo Macro-Ciclo 2: Pianificazione con risposta esterna) ---
    const step4 = timeline[3];
    expect(step4.step).toBe(4);
    expect(step4.macroCycle).toBe(1); // c = 1 (secondo macro-ciclo)
    expect(step4.phase).toBe('q_intro');
    expect(step4.state.Ta).toEqual(['w_db_ordini']);
    expect(step4.calls[0].name).toBe('imposta_dato');

    // --- FASE 5: Passo 5 (Intro dopo aver salvato in memoria Ds) ---
    const step5 = timeline[4];
    expect(step5.step).toBe(5);
    expect(step5.phase).toBe('q_intro');
    // Verifica che 'ordine_trovato' sia ora presente nello stato Ds
    expect(step5.state.Ds).toEqual({
      anno: 2026,
      valuta: 'EUR',
      ordine_trovato: { id: 'ORD-42', totale: 300 }
    });
    expect(step5.calls[0].name).toBe('a_concludi_intro');

    // --- FASE 6: Passo 6 (Azione operativa finale con terminazione) ---
    const step6 = timeline[5];
    expect(step6.step).toBe(6);
    expect(step6.phase).toBe('q_exec');
    expect(step6.directive).toBe('start_exec');
    expect(step6.state.Ds.ordine_trovato).toEqual({ id: 'ORD-42', totale: 300 });
    expect(step6.calls[0].name).toBe('a_concluso');
    expect(step6.calls[0].payload).toEqual({ ordine_id: 'ORD-42', concluso: true });

    // 7. Verifica anche toJSON() completo con serializzazione corretta di Set e Map
    const fullEventsJSON = collector.toJSON();
    const parsedEvents = JSON.parse(fullEventsJSON);
    expect(Array.isArray(parsedEvents)).toBe(true);

    const inferenceEvents = parsedEvents.filter((e: any) => e.type === 'model_inference');
    expect(inferenceEvents).toHaveLength(6);
    // Verifica che stateSnapshot.Ta sia stato serializzato come Array e non come oggetto vuoto {}
    expect(Array.isArray(inferenceEvents[1].stateSnapshot.Ta)).toBe(true);
    expect(inferenceEvents[1].stateSnapshot.Ta).toContain('w_db_ordini');
  });
});
