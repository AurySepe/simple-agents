import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDefaultFrameworkConfig,
  defineAgent,
  extractBehavioralTrajectory,
  FrameworkEngine,
  LanguageModelAdapter,
  serializeAgentState
} from '../src/index.js';

describe('extractBehavioralTrajectory & Offline State Trajectory', () => {
  const contract = {
    identity: 'TravelPlanner',
    mission: 'Organizza viaggi',
    stateSchema: z.object({
      citiesVisited: z.array(z.string()),
      budgetLeft: z.number()
    }),
    tools: {
      check_flight: {
        description: 'Verifica voli',
        parameters: z.object({ from: z.string(), to: z.string() }),
        returns: z.object({ price: z.number(), flightId: z.string() })
      },
      book_hotel: {
        description: 'Prenota hotel',
        parameters: z.object({ city: z.string(), nights: z.number() }),
        returns: z.object({ hotelId: z.string(), cost: z.number() })
      }
    },
    terminations: {
      plan_confirmed: {
        description: 'Piano confermato',
        schema: z.object({ itineraryId: z.string(), totalCost: z.number() })
      },
      plan_aborted: {
        description: 'Piano annullato',
        schema: z.object({ reason: z.string() })
      }
    }
  };

  const agentDef = defineAgent(contract);
  const implemented = agentDef.implement({
    initialState: { citiesVisited: [], budgetLeft: 1000 },
    tools: {
      check_flight: async () => ({ price: 200, flightId: 'FL-1' }),
      book_hotel: async () => ({ hotelId: 'HT-1', cost: 300 })
    }
  });

  it('dovrebbe estrarre una traiettoria comportamentale completa a partire da uno stato già parsato e tipizzato', async () => {
    let inferStep = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        inferStep++;
        if (inferStep === 1) {
          return {
            thought: 'Cerco un volo per Parigi',
            calls: [{ id: 'c1', name: 'check_flight', payload: { from: 'Rome', to: 'Paris' } }]
          };
        }
        if (inferStep === 2) {
          return {
            thought: 'Prenoto hotel a Parigi',
            calls: [{ id: 'c2', name: 'book_hotel', payload: { city: 'Paris', nights: 2 } }]
          };
        }
        return {
          thought: 'Concludo il piano',
          calls: [{ id: 'c3', name: 'plan_confirmed', payload: { itineraryId: 'IT-99', totalCost: 500 } }]
        };
      }
    };

    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    const runResult = await implemented.run(engine, model, {
      userContent: 'Organizza viaggio a Parigi'
    });

    expect(runResult.status).toBe('halt');

    // 1. Validazione e tipizzazione dello stato mediante parseState
    const parseResult = implemented.parseState(runResult.state);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) throw new Error(parseResult.error.message);
    const typedState = parseResult.state;

    // 2. Estrazione della traiettoria dallo stato tipizzato
    const trajectory = implemented.extractTrajectory(typedState);

    // Verifiche sul Summary
    expect(trajectory.summary.isTerminated).toBe(true);
    expect(trajectory.summary.status).toBe('q_halt');
    expect(trajectory.summary.exitContract).toBe('plan_confirmed');
    expect(trajectory.summary.exitPayload).toEqual({ itineraryId: 'IT-99', totalCost: 500 });
    expect(trajectory.summary.totalSteps).toBe(3);
    expect(trajectory.summary.totalToolCalls).toBe(2);
    expect(trajectory.summary.redundantCallsCount).toBe(0);
    expect(trajectory.summary.repairCount).toBe(0);

    // Verifiche sui Tool
    expect(trajectory.tools.callSequence).toEqual(['check_flight', 'book_hotel']);
    expect(trajectory.tools.usageCounts).toEqual({
      check_flight: 1,
      book_hotel: 1
    });

    // Verifiche su State tipizzato
    const budget: number = trajectory.state.Ds.budgetLeft;
    expect(budget).toBe(1000);
    expect(trajectory.state.I).toBe('TravelPlanner');

    // Verifiche sui singoli Step
    expect(trajectory.steps).toHaveLength(3);
    
    // Passo 1
    expect(trajectory.steps[0].step).toBe(1);
    expect(trajectory.steps[0].thought).toBe('Cerco un volo per Parigi');
    expect(trajectory.steps[0].actions[0].name).toBe('check_flight');
    expect(trajectory.steps[0].results[0].status).toBe('success');
    expect(trajectory.steps[0].results[0].content).toEqual({ price: 200, flightId: 'FL-1' });

    // Passo 2
    expect(trajectory.steps[1].step).toBe(2);
    expect(trajectory.steps[1].actions[0].name).toBe('book_hotel');
    expect(trajectory.steps[1].results[0].status).toBe('success');

    // Passo 3 (Terminazione)
    expect(trajectory.steps[2].step).toBe(3);
    expect(trajectory.steps[2].actions[0].name).toBe('plan_confirmed');
    expect(trajectory.steps[2].results).toHaveLength(0); // Nessun tool result per terminazione
  });

  it('dovrebbe funzionare offline: prima parseState(deserializedObj) e poi extractTrajectory(typedState)', async () => {
    let inferStep = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        inferStep++;
        if (inferStep === 1) {
          return {
            thought: 'Chiamata 1',
            calls: [{ id: 'c1', name: 'check_flight', payload: { from: 'Milan', to: 'London' } }]
          };
        }
        return {
          thought: 'Fine',
          calls: [{ id: 'c2', name: 'plan_aborted', payload: { reason: 'Nessun volo utile' } }]
        };
      }
    };

    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    const runResult = await implemented.run(engine, model, {
      userContent: 'Volo per Londra'
    });

    // Simulazione salvataggio DB: serializzazione in formato wire (es. JSON string)
    const serialized = serializeAgentState(runResult.state);
    const jsonString = JSON.stringify(serialized);

    // Verifica che parseState rifiuti direttamente la stringa grezza con un Result { ok: false }
    const invalidParse = agentDef.parseState(jsonString);
    expect(invalidParse.ok).toBe(false);
    if (!invalidParse.ok) {
      expect(invalidParse.error.code).toBe('NOT_AN_OBJECT');
    }

    // Passo 1: il driver/codec decodifica il wire format in oggetto JavaScript
    const decodedObject = JSON.parse(jsonString);

    // Passo 2: validazione e raffinamento semantico contro il contratto dell'agente
    const parseResult = agentDef.parseState(decodedObject);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) throw new Error(parseResult.error.message);
    const typedState = parseResult.state;

    // Passo 3: extractTrajectory accetta SOLO l'oggetto tipizzato (TypedAgentState)
    const offlineTrajectory = agentDef.extractTrajectory(typedState);

    expect(offlineTrajectory.summary.isTerminated).toBe(true);
    expect(offlineTrajectory.summary.exitContract).toBe('plan_aborted');
    expect(offlineTrajectory.summary.exitPayload).toEqual({ reason: 'Nessun volo utile' });
    expect(offlineTrajectory.tools.callSequence).toEqual(['check_flight']);
    expect(offlineTrajectory.steps).toHaveLength(2);

    // Anche via funzione standalone
    const standalone = extractBehavioralTrajectory(agentDef, typedState);
    expect(standalone.summary.exitContract).toBe('plan_aborted');
  });

  it('dovrebbe rilevare chiamate ridondanti (loop) su uno stato tipizzato', async () => {
    let inferStep = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        inferStep++;
        if (inferStep === 1) {
          return {
            thought: 'Provo volo',
            calls: [{ id: 'c1', name: 'check_flight', payload: { from: 'Rome', to: 'Paris' } }]
          };
        }
        if (inferStep === 2) {
          return {
            thought: 'Riprovo identico volo',
            calls: [{ id: 'c2', name: 'check_flight', payload: { from: 'Rome', to: 'Paris' } }]
          };
        }
        return {
          thought: 'Stop',
          calls: [{ id: 'c3', name: 'plan_confirmed', payload: { itineraryId: 'IT-1', totalCost: 100 } }]
        };
      }
    };

    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    const runResult = await implemented.run(engine, model, { userContent: 'Test loop' });

    const parseResult = implemented.parseState(runResult.state);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) throw new Error(parseResult.error.message);
    const typedState = parseResult.state;
    const trajectory = implemented.extractTrajectory(typedState);

    expect(trajectory.summary.redundantCallsCount).toBe(1);
    expect(trajectory.tools.usageCounts.check_flight).toBe(2);
  });
});
