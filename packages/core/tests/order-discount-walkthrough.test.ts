import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  LanguageModelAdapter,
  RunResult,
  WorldTool
} from '../src/index.js';

describe('Walkthrough End-to-End: Ordine e Sconto Commerciale (3 Macro-Cicli in Ω_op)', () => {
  function setupCommercialScenario() {
    // 1. LIVELLO 1: Framework Ω_op (Standard Library di default)
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());

    // 2. LIVELLO 2: Il Mondo W (Database Ordini e Servizio Sconti)
    const worldDatabase: Record<number, { ordine_id: string; totale: number; stato: string }> = {
      55: { ordine_id: 'ORD-99', totale: 200.0, stato: 'PREVENTIVO' }
    };

    const dbOrdiniTool: WorldTool = {
      id: 'w_db_ordini',
      description: 'Recupera l ultimo preventivo associato all identificativo del cliente.',
      parameters: z.object({
        cliente_id: z.number().int().positive()
      }),
      execute: async ({ cliente_id }) => {
        return worldDatabase[cliente_id];
      }
    };

    const applicaScontoTool: WorldTool = {
      id: 'w_applica_sconto',
      description: 'Modifica il totale del preventivo applicando la percentuale di sconto autorizzata.',
      parameters: z.object({
        ordine_id: z.string(),
        percentuale: z.number().positive()
      }),
      execute: async () => {
        return { nuovo_totale: 170.0, esito: 'APPLICATO' };
      }
    };

    const world = createWorldRegistry([dbOrdiniTool, applicaScontoTool]);
    const runtime = framework.bindWorld(world);

    // 3. LIVELLO 3: Manifesto dell'Agente Commerciale Operativo
    const manifest: AgentManifest = {
      I: "Sei l'Assistente Commerciale Aziendale. Applica le policy in modo rigoroso.",
      Ms0: 'Verificare preventivo del cliente 55 e applicare sconto VIP',
      Ds0: { anno_fiscale: 2026 },
      Ta0: ['w_db_ordini', 'w_applica_sconto'],
      Ka0: [
        {
          name: 'pol_sconti_2026',
          descrizione: 'Policy sconti 2026',
          corpo: 'Preventivi oltre 150€ hanno diritto al 15% di sconto.'
        }
      ],
      A_term: [
        {
          id: 'a_successo',
          description: 'Terminazione con successo della richiesta di sconto',
          schema: z.object({
            ordine_id: z.string(),
            totale_finale: z.number(),
            sconto_applicato: z.number()
          })
        }
      ]
    };

    // 4. MOCK DEL MODELLO LINGUISTICO: Riproduce fedelmente i 3 passi operativi
    function createMockModel() {
      let stepCount = 0;
      const model: LanguageModelAdapter = {
        infer: async (ctx) => {
          stepCount++;

          // --- MACRO-CICLO c = 0 ---
          // Passo 1: Chiama il DB fisico w_db_ordini
          if (stepCount === 1) {
            expect(ctx.visibleTools.some((t) => t.id === 'w_db_ordini')).toBe(true);
            expect(ctx.visibleTools.some((t) => t.id === 'a_successo')).toBe(true);
            return {
              thought: 'Interrogo il database ordini per il cliente 55.',
              calls: [
                {
                  id: 'call_db_1',
                  name: 'w_db_ordini',
                  payload: { cliente_id: 55 }
                }
              ]
            };
          }

          // --- MACRO-CICLO c = 1 (dopo risveglio dal mondo) ---
          // Passo 2: Chiama w_applica_sconto (15% di sconto su ORD-99)
          if (stepCount === 2) {
            expect(ctx.messages.some((m) => m.type === 'result' && m.callId === 'call_db_1')).toBe(true);
            return {
              thought: 'Il totale supera 150€: applico lo sconto del 15% sull ordine ORD-99.',
              calls: [
                {
                  id: 'call_disc_1',
                  name: 'w_applica_sconto',
                  payload: { ordine_id: 'ORD-99', percentuale: 15.0 }
                }
              ]
            };
          }

          // --- MACRO-CICLO c = 2 (dopo secondo risveglio dal mondo) ---
          // Passo 3: Emette il contratto di terminazione tipizzato!
          if (stepCount === 3) {
            expect(ctx.messages.some((m) => m.type === 'result' && m.callId === 'call_disc_1')).toBe(true);
            return {
              thought: 'Tutto completato. Emetto la terminazione tipizzata a_successo.',
              calls: [
                {
                  id: 'call_term_1',
                  name: 'a_successo',
                  payload: {
                    ordine_id: 'ORD-99',
                    totale_finale: 170.0,
                    sconto_applicato: 15.0
                  }
                }
              ]
            };
          }

          throw new Error(`Passo inatteso: ${stepCount}`);
        }
      };
      return { model, getStepCount: () => stepCount };
    }

    return { runtime, world, manifest, createMockModel };
  }

  it('dovrebbe eseguire il walkthrough passo per passo ispezionando yield, chiamate fisiche e risveglio', async () => {
    const { runtime, world, manifest, createMockModel } = setupCommercialScenario();
    const { model, getStepCount } = createMockModel();
    const agent = runtime.spawnAgent(manifest, model);

    // CICLO 0 (c = 0): Richiesta iniziale dell'utente
    agent.feedPayload({
      userContent: {
        kind: 'text',
        text: "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€."
      }
    });

    const outcome0 = await agent.resume();
    expect(outcome0.status).toBe('yield');
    if (outcome0.status !== 'yield') throw new Error('Expected yield');
    expect(outcome0.macroCycle).toBe(0);
    expect(outcome0.pendingCalls).toHaveLength(1);
    expect(outcome0.pendingCalls[0].name).toBe('w_db_ordini');

    // Chiamata fisica w_db_ordini
    const call0 = outcome0.pendingCalls[0];
    const dbResult = await world.executeTool(call0.name, call0.payload);
    if (!dbResult.ok) throw new Error('Database tool failed');

    // CICLO 1 (c = 1): Risveglio dell'agente con il risultato del database
    agent.feedPayload({
      worldResults: [{ callId: call0.id, result: dbResult.data }]
    });

    const outcome1 = await agent.resume();
    expect(outcome1.status).toBe('yield');
    if (outcome1.status !== 'yield') throw new Error('Expected yield');
    expect(outcome1.macroCycle).toBe(1);
    expect(outcome1.pendingCalls).toHaveLength(1);
    expect(outcome1.pendingCalls[0].name).toBe('w_applica_sconto');

    // Chiamata fisica w_applica_sconto
    const call1 = outcome1.pendingCalls[0];
    const discountResult = await world.executeTool(call1.name, call1.payload);
    if (!discountResult.ok) throw new Error('Discount tool failed');

    // CICLO 2 (c = 2): Risveglio finale e terminazione
    agent.feedPayload({
      worldResults: [{ callId: call1.id, result: discountResult.data }]
    });

    const outcome2 = await agent.resume();
    expect(outcome2.status).toBe('halt');
    if (outcome2.status !== 'halt') throw new Error('Expected halt');
    expect(outcome2.result.type).toBe('a_successo');
    expect(outcome2.result.payload).toEqual({
      ordine_id: 'ORD-99',
      totale_finale: 170.0,
      sconto_applicato: 15.0
    });

    expect(agent.getControlState()).toBe('q_halt');
    expect(agent.getState().Ms).toBe('Verificare preventivo del cliente 55 e applicare sconto VIP');
    expect(agent.getState().Ka.has('pol_sconti_2026')).toBe(true);
    expect(agent.getState().Ta.has('w_db_ordini')).toBe(true);
    expect(agent.getState().Ta.has('w_applica_sconto')).toBe(true);
    expect(getStepCount()).toBe(3);
  });

  it('dovrebbe eseguire l intero scenario in modo completamente autonomo tramite runtime.runAgent() in una sola chiamata', async () => {
    const { runtime, manifest, createMockModel } = setupCommercialScenario();
    const { model, getStepCount } = createMockModel();

    const visitedCycles: number[] = [];
    const executedTools: string[] = [];

    // Esecuzione autonoma end-to-end con consumazione automatica di tool e risvegli
    const runResult: RunResult = await runtime.runAgent(manifest, model, {
      userContent: {
        kind: 'text',
        text: "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€."
      },
      onMacroCycle: (cycle) => {
        visitedCycles.push(cycle);
      },
      beforeToolExecution: (toolId) => {
        executedTools.push(toolId);
      }
    });

    // 1. Verifica terminazione corretta
    expect(runResult.status).toBe('halt');
    if (runResult.status !== 'halt') throw new Error('Expected halt');
    expect(runResult.result.type).toBe('a_successo');
    expect(runResult.result.payload).toEqual({
      ordine_id: 'ORD-99',
      totale_finale: 170.0,
      sconto_applicato: 15.0
    });

    // 2. Verifica dei macro-cicli consumati (2 yield verso il mondo esterno)
    expect(runResult.macroCycles).toBe(2);
    expect(visitedCycles).toEqual([0, 1, 2]);

    // 3. Verifica dei tool fisici eseguiti automaticamente dal motore
    expect(executedTools).toEqual(['w_db_ordini', 'w_applica_sconto']);

    // 4. Verifica dello stato interno finale
    expect(runResult.state.Ms).toBe('Verificare preventivo del cliente 55 e applicare sconto VIP');
    expect(runResult.state.Ka.has('pol_sconti_2026')).toBe(true);
    expect(runResult.state.Ta.has('w_db_ordini')).toBe(true);
    expect(runResult.state.Ta.has('w_applica_sconto')).toBe(true);

    // 5. Tutti i 3 passi operativi sono stati eseguiti
    expect(getStepCount()).toBe(3);
  });
});
