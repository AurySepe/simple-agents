import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDefaultFrameworkConfig,
  createEvaluationCollector,
  createRunner,
  defineAgent,
  EvaluationCollector,
  FrameworkEngine,
  LanguageModelAdapter
} from '../src/index.js';

describe('EvaluationCollector & Scorecard System', () => {
  it('dovrebbe raccogliere eventi e produrre un EvaluationReport completo che incrocia stato e performance', async () => {
    const agentDef = defineAgent({
      identity: 'EvaluatedAgent',
      mission: 'Ricerca e acquisto',
      stateSchema: z.object({
        itemsFound: z.number(),
        budgetLeft: z.number()
      }),
      tools: {
        search_item: {
          description: 'Cerca un articolo',
          parameters: z.object({ query: z.string() }),
          returns: z.object({ found: z.boolean(), price: z.number() })
        },
        buy_item: {
          description: 'Acquista un articolo',
          parameters: z.object({ itemId: z.string(), price: z.number() }),
          returns: z.object({ success: z.boolean() })
        }
      },
      terminations: {
        complete: {
          description: 'Acquisto completato',
          schema: z.object({ totalSpent: z.number() })
        }
      }
    });

    const implemented = agentDef.implement({
      initialState: { itemsFound: 0, budgetLeft: 500 },
      tools: {
        search_item: async ({ query }) => {
          return { found: true, price: 150 };
        },
        buy_item: async ({ itemId, price }) => {
          return { success: true };
        }
      }
    });

    let step = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        step++;
        if (step === 1) {
          return {
            thought: 'Cerco l\'articolo nel catalogo',
            calls: [{ id: 'c1', name: 'search_item', payload: { query: 'Laptop' } }],
            usage: {
              promptTokens: 100,
              completionTokens: 25,
              totalTokens: 125,
              tokensPerSecond: 30.5
            }
          };
        }
        if (step === 2) {
          return {
            thought: 'Articolo trovato a 150€, procedo con l\'acquisto',
            calls: [{ id: 'c2', name: 'buy_item', payload: { itemId: 'item_99', price: 150 } }],
            usage: {
              promptTokens: 150,
              completionTokens: 35,
              totalTokens: 185,
              tokensPerSecond: 28.0
            }
          };
        }
        return {
          thought: 'Acquisto concluso, termino con complete',
          calls: [{ id: 'c3', name: 'complete', payload: { totalSpent: 150 } }],
          usage: {
            promptTokens: 200,
            completionTokens: 20,
            totalTokens: 220,
            tokensPerSecond: 35.0
          }
        };
      }
    };

    const collector = createEvaluationCollector();
    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    const runner = createRunner({ defaultEngine: false })
      .withEngine(engine)
      .withModel(model)
      .withAgent(implemented)
      .withInitialState({ itemsFound: 0, budgetLeft: 500 });

    const runResult = await runner.run({
      userContent: { kind: 'text', text: 'Acquista un laptop entro 500€' },
      observers: [collector]
    });

    expect(runResult.status).toBe('halt');

    // Generazione del report di valutazione
    const report = collector.generateReport();

    // 1. Verifica Summary
    expect(report.summary.status).toBe('halt');
    expect(report.summary.exitContract).toBe('complete');
    expect(report.summary.exitPayload).toEqual({ totalSpent: 150 });
    expect(report.summary.totalInferences).toBe(3);
    expect(report.summary.totalWorldActions).toBe(2);
    expect(report.summary.repairCount).toBe(0);

    // 2. Verifica Performance & Token
    expect(report.performance.tokens.promptTokens).toBe(450); // 100 + 150 + 200
    expect(report.performance.tokens.completionTokens).toBe(80); // 25 + 35 + 20
    expect(report.performance.tokens.totalTokens).toBe(530);
    expect(report.performance.totalInferenceDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.performance.totalWorldDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.performance.wallClockDurationMs).toBeGreaterThanOrEqual(0);

    // 3. Verifica Comportamento & Traiettoria
    expect(report.behavior.toolUsageCounts).toEqual({
      search_item: 1,
      buy_item: 1
    });
    expect(report.behavior.toolCallsSequence).toEqual(['search_item', 'buy_item']);
    expect(report.behavior.redundantCallsCount).toBe(0);
    expect(report.behavior.hadRepairOccurrences).toBe(false);

    // 4. Verifica Timeline (incrocio stato + pensiero + azione + metrica)
    expect(report.timeline).toHaveLength(3);
    
    // Passo 1
    const p1 = report.timeline[0];
    expect(p1.step).toBe(1);
    expect(p1.thought).toBe('Cerco l\'articolo nel catalogo');
    expect(p1.actions[0].name).toBe('search_item');
    expect(p1.worldResults[0].toolId).toBe('search_item');
    expect(p1.worldResults[0].status).toBe('success');
    expect(p1.worldResults[0].result).toEqual({ found: true, price: 150 });
    expect(p1.usage?.promptTokens).toBe(100);
    expect(p1.state.Ds).toEqual({ itemsFound: 0, budgetLeft: 500 });

    // Passo 2
    const p2 = report.timeline[1];
    expect(p2.step).toBe(2);
    expect(p2.actions[0].name).toBe('buy_item');
    expect(p2.worldResults[0].toolId).toBe('buy_item');
    expect(p2.usage?.promptTokens).toBe(150);

    // Passo 3 (Terminazione)
    const p3 = report.timeline[2];
    expect(p3.step).toBe(3);
    expect(p3.actions[0].name).toBe('complete');
    expect(p3.worldResults).toHaveLength(0); // L'azione terminale non è un tool di mondo
    expect(p3.usage?.totalTokens).toBe(220);
  });

  it('dovrebbe generare un EvaluationReport con tipi inferiti automaticamente dal contratto', async () => {
    const contract = {
      identity: 'typed_agent',
      mission: 'Missione con tipi forti',
      stateSchema: z.object({
        score: z.number(),
        category: z.enum(['A', 'B'])
      }),
      tools: {
        calc_score: {
          description: 'Calcola punteggio',
          parameters: z.object({ delta: z.number() }),
          returns: z.object({ newScore: z.number() })
        }
      },
      terminations: {
        done: {
          description: 'Finito',
          schema: z.object({ finalCategory: z.enum(['A', 'B']) })
        }
      }
    };

    const agentDef = defineAgent(contract);
    const implemented = agentDef.implement({
      initialState: { score: 10, category: 'A' },
      tools: {
        calc_score: async ({ delta }) => ({ newScore: 10 + delta })
      }
    });

    // 1. Istanziazione tipizzata direttamente dall'agente
    const collector = implemented.bind(undefined, { score: 10, category: 'A' }).createEvaluationCollector();

    const model: LanguageModelAdapter = {
      infer: async () => ({
        thought: 'Termino',
        calls: [{ id: 'c1', name: 'done', payload: { finalCategory: 'A' } }]
      })
    };

    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    await implemented.bind(undefined, { score: 10, category: 'A' }).run(engine, model, {
      userContent: { kind: 'text', text: 'Go' },
      observers: [collector]
    });

    const report = collector.generateReport();

    // Verifiche a tempo di compilazione e runtime:
    if (report.summary.status === 'halt') {
      // report.summary.exitContract è strettamente 'done'
      const contractUsed: 'done' = report.summary.exitContract;
      expect(contractUsed).toBe('done');
      // report.summary.exitPayload è tipizzato con { finalCategory: 'A' | 'B' }
      const finalCat: 'A' | 'B' = report.summary.exitPayload.finalCategory;
      expect(finalCat).toBe('A');
    }

    // report.timeline[0].state.Ds è tipizzato con { score: number, category: 'A' | 'B' }
    const currentScore: number = report.timeline[0].state.Ds.score;
    const currentCategory: 'A' | 'B' = report.timeline[0].state.Ds.category;
    expect(currentScore).toBe(10);
    expect(currentCategory).toBe('A');

    // Anche via helper createEvaluationCollector(implemented) o createEvaluationCollector(agentDef)
    const fromHelper = createEvaluationCollector(implemented);
    expect(fromHelper).toBeInstanceOf(EvaluationCollector);
  });
});

