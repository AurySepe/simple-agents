import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDefaultFrameworkConfig,
  createRunner,
  defineAgent,
  FrameworkEngine,
  InferenceTriple,
  isDataRecord,
  LanguageModelAdapter,
  ModelResult
} from '../src/index.js';

describe('RunnerBuilder & Ergonomia Esecutiva (Type-State Pattern & Symmetric Run)', () => {
  // Mock Agent
  const echoAgent = defineAgent({
    identity: 'Agente Calcolatore Semplice',
    mission: 'Esegue somme e moltiplicazioni richieste.',
    tools: {
      somma: {
        description: 'Esegue la somma di due interi.',
        parameters: z.object({ a: z.number(), b: z.number() }),
        returns: z.object({ risultato: z.number() })
      }
    },
    terminations: {
      risultato_finale: {
        description: 'Termina restituendo il risultato calcolato.',
        schema: z.object({ valore: z.number() })
      }
    }
  });

  const implementedEcho = echoAgent.implement({
    tools: {
      somma: async ({ a, b }) => ({ risultato: a + b })
    }
  });

  function createMockCalculatorModel(): LanguageModelAdapter {
    let step = 0;
    return {
      async infer(ctx: InferenceTriple): Promise<ModelResult> {
        step++;
        if (step === 1) {
          return {
            status: 'success',
            thought: 'Devo sommare 10 e 25.',
            calls: [
              {
                id: 'call_somma',
                name: 'somma',
                payload: { a: 10, b: 25 }
              }
            ]
          };
        } else {
          return {
            status: 'success',
            thought: 'Ho ottenuto 35. Termino.',
            calls: [
              {
                id: 'call_term',
                name: 'risultato_finale',
                payload: { valore: 35 }
              }
            ]
          };
        }
      }
    };
  }

  it('deve supportare identity come nome formale dell agente', () => {
    expect(implementedEcho.manifest.I).toBe('Agente Calcolatore Semplice');
  });

  it('deve supportare la chiamata speculare engine.run(agent, model)', async () => {
    const engine = new FrameworkEngine(createDefaultFrameworkConfig());
    const model = createMockCalculatorModel();

    // Approccio engine-first: engine.run(agent, model)
    const outcome = await engine.run(implementedEcho, model, {
      userContent: { kind: 'text', text: 'Calcola 10 + 25' }
    });

    expect(outcome.status).toBe('halt');
    if (outcome.status === 'halt') {
      expect(outcome.result.type).toBe('risultato_finale');
      if (isDataRecord(outcome.result.payload)) {
        expect(outcome.result.payload.valore).toBe(35);
      }
    }
  });

  it('deve eseguire lagente tramite createRunner() in ordine libero (model prima di agent)', async () => {
    const model = createMockCalculatorModel();

    // Ordine: withModel -> withAgent -> run
    const outcome = await createRunner()
      .withModel(model)
      .withAgent(implementedEcho)
      .run({ userContent: { kind: 'text', text: 'Calcola 10 + 25' } });

    expect(outcome.status).toBe('halt');
    if (outcome.status === 'halt') {
      expect(outcome.result.type).toBe('risultato_finale');
      if (isDataRecord(outcome.result.payload)) {
        expect(outcome.result.payload.valore).toBe(35);
      }
    }
  });

  it('deve eseguire lagente tramite createRunner() in ordine inverso (agent prima di model)', async () => {
    const model = createMockCalculatorModel();

    // Ordine inverso: withAgent -> withModel -> run
    const outcome = await createRunner()
      .withAgent(implementedEcho)
      .withModel(model)
      .run({ userContent: { kind: 'text', text: 'Calcola 10 + 25' } });

    expect(outcome.status).toBe('halt');
    if (outcome.status === 'halt') {
      expect(outcome.result.type).toBe('risultato_finale');
      if (isDataRecord(outcome.result.payload)) {
        expect(outcome.result.payload.valore).toBe(35);
      }
    }
  });

  it('deve consentire di creare un Preset riutilizzabile e immutabile', async () => {
    const model = createMockCalculatorModel();

    // Preset aziendale pre-configurato con motore e modello
    const baseRunner = createRunner()
      .withModel(model)
      .withOptions({ maxTicks: 50 });

    // Istanza 1 con echoAgent
    const outcome1 = await baseRunner
      .withAgent(implementedEcho)
      .run({ userContent: { kind: 'text', text: 'Calcolo 1' } });

    expect(outcome1.status).toBe('halt');

    // Il preset baseRunner non è stato mutato: possiamo agganciare un altro agente
    const anotherAgent = defineAgent({
      identity: 'Agente Saluto',
      mission: 'Saluta l utente.',
      tools: {},
      terminations: {
        saluto: {
          description: 'Termina salutando.',
          schema: z.object({ msg: z.string() })
        }
      }
    }).implement({
      tools: {}
    });

    const greetingModel: LanguageModelAdapter = {
      async infer(): Promise<ModelResult> {
        return {
          status: 'success',
          thought: 'Saluto subito.',
          calls: [{ id: 'c1', name: 'saluto', payload: { msg: 'Ciao!' } }]
        };
      }
    };

    const outcome2 = await baseRunner
      .withModel(greetingModel) // override del modello per questo specifico agente
      .withAgent(anotherAgent)
      .run({ userContent: { kind: 'text', text: 'Ciao' } });

    expect(outcome2.status).toBe('halt');
    if (outcome2.status === 'halt') {
      expect(outcome2.result.type).toBe('saluto');
      if (outcome2.result.type === 'saluto') {
        // Tipizzazione dedotta automaticamente dal RunnerBuilder!
        expect(outcome2.result.payload.msg).toBe('Ciao!');
      }
    }
  });
});

