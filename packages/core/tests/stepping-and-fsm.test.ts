import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  BoundRuntime,
  createWorldRegistry,
  FrameworkEngine,
  LanguageModelAdapter,
  ModelOutput,
  WorldTool
} from '../src/index.js';

describe('Automa a Stati Finiti: Stepping (step) e Resumption (resume) in Ω_op', () => {
  const mockTool: WorldTool = {
    id: 'esegui_calcolo',
    description: 'Esegue un calcolo matematico',
    parameters: z.object({ x: z.number(), y: z.number() }),
    execute: async (args: { x: number; y: number }) => ({ totale: args.x + args.y })
  };

  const engine = new FrameworkEngine();
  const mockWorld = createWorldRegistry([mockTool]);
  const runtime: BoundRuntime = engine.bindWorld(mockWorld);

  const manifest: AgentManifest = {
    I: 'Agente di test FSM Operativo',
    Ms0: 'In attesa di istruzioni operative',
    Ta0: ['esegui_calcolo'],
    A_term: [
      {
        id: 'rispondi_e_termina',
        description: 'Risposta finale al cliente',
        schema: z.object({ messaggio: z.string() })
      }
    ]
  };

  it('dovrebbe avanzare micro-passo per micro-passo tramite step() rispettando gli stati FSM (sleep -> exec -> yield -> exec -> halt)', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: In q_exec, chiama esegui_calcolo
      {
        thought: 'Devo eseguire il calcolo per l utente.',
        calls: [
          {
            id: 'call_calc_1',
            name: 'esegui_calcolo',
            payload: { x: 10, y: 20 }
          }
        ]
      },
      // Passo 2: Dopo aver ricevuto il risultato dal mondo in q_exec, termina con rispondi_e_termina
      {
        thought: 'Calcolo completato, ora termino il task.',
        calls: [
          {
            id: 'call_term_1',
            name: 'rispondi_e_termina',
            payload: { messaggio: 'Il totale calcolato e 30' }
          }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);

    // 0. Stato iniziale: q_sleep
    expect(agent.getControlState()).toBe('q_sleep');

    // 1. Invio stimolo utente -> transizione a q_exec
    agent.feedPayload({ userContent: { kind: 'text', text: 'Calcola 10 + 20.' } });
    expect(agent.getControlState()).toBe('q_exec');
    expect(agent.getTimeIndex()).toEqual({ c: 0, t: 0 });

    // 2. Micro-passo 1: step() emette esegui_calcolo e transita a q_yield
    const step1 = await agent.step();
    expect(step1.status).toBe('yield');
    if (step1.status === 'yield') {
      expect(step1.pendingCalls).toHaveLength(1);
      expect(step1.pendingCalls[0].name).toBe('esegui_calcolo');
      expect(step1.pendingCalls[0].payload).toEqual({ x: 10, y: 20 });
    }
    expect(agent.getControlState()).toBe('q_yield');

    // 3. Risultato dal mondo fornito tramite feedPayload -> transizione a q_exec (c incrementato)
    agent.feedPayload({
      worldResults: [{ callId: 'call_calc_1', result: { totale: 30 } }]
    });
    expect(agent.getControlState()).toBe('q_exec');
    expect(agent.getTimeIndex().c).toBe(1);

    // 4. Micro-passo 2: step() emette rispondi_e_termina e transita a q_halt
    const step2 = await agent.step();
    expect(step2.status).toBe('halt');
    if (step2.status === 'halt') {
      expect(step2.result.type).toBe('rispondi_e_termina');
      expect(step2.result.payload).toEqual({ messaggio: 'Il totale calcolato e 30' });
    }
    expect(agent.getControlState()).toBe('q_halt');
  });

  it('dovrebbe consentire il resume() fino al punto di yield e poi completare ad halt', async () => {
    const responses: ModelOutput[] = [
      {
        calls: [
          {
            id: 'call_calc_2',
            name: 'esegui_calcolo',
            payload: { x: 5, y: 5 }
          }
        ]
      },
      {
        calls: [
          {
            id: 'call_term_2',
            name: 'rispondi_e_termina',
            payload: { messaggio: 'Fatto' }
          }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);
    agent.feedPayload({ userContent: { kind: 'text', text: 'Inizia.' } });

    // resume() si arresta al primo punto di sospensione: q_yield
    const yieldOutcome = await agent.resume();
    expect(yieldOutcome.status).toBe('yield');
    expect(agent.getControlState()).toBe('q_yield');

    // Forniamo l'esito del mondo
    agent.feedPayload({
      worldResults: [{ callId: 'call_calc_2', result: { totale: 10 } }]
    });

    // Secondo resume(): completa fino a q_halt
    const haltOutcome = await agent.resume();
    expect(haltOutcome.status).toBe('halt');
    expect(agent.getControlState()).toBe('q_halt');
  });

  it('dovrebbe gestire la transizione a q_repair in caso di schema error e recuperare con a_abort_call', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: parametri non conformi allo schema (x non è numero)
      {
        calls: [
          {
            id: 'c_err',
            name: 'esegui_calcolo',
            payload: { x: 'non_un_numero' as any, y: 10 }
          }
        ]
      },
      // Passo 2: in q_repair, l'agente esegue a_abort_call
      {
        calls: [
          { id: 'c_abort', name: 'a_abort_call', payload: {} }
        ]
      },
      // Passo 3: ritornato in q_exec, termina
      {
        calls: [
          { id: 'c_term', name: 'rispondi_e_termina', payload: { messaggio: 'Operazione annullata' } }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);
    agent.feedPayload({ userContent: { kind: 'text', text: 'Test errore schema.' } });

    // Step 1: errore di schema -> transizione a q_repair
    const step1 = await agent.step();
    expect(step1.status).toBe('running');
    expect(agent.getControlState()).toBe('q_repair');

    // Verifica messaggio di diagnostica di tipo 'result'
    const ep = agent.getState().Ep;
    const errResult = ep.find((e) => e.type === 'result' && e.callId === 'c_err');
    expect(errResult).toBeDefined();
    expect((errResult?.content as any)?.status).toBe('error');

    // Step 2: a_abort_call -> transizione a q_exec
    const step2 = await agent.step();
    expect(step2.status).toBe('running');
    expect(agent.getControlState()).toBe('q_exec');

    // Step 3: in q_exec termina
    const step3 = await agent.step();
    expect(step3.status).toBe('halt');
    expect(agent.getControlState()).toBe('q_halt');
  });

  it('dovrebbe gestire la transizione a q_repair in presenza di syntax_error e riparare con la chiamata valida', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: Errore di sintassi JSON generato dal provider LLM
      {
        calls: [
          {
            status: 'syntax_error',
            id: 'call_syntax_err',
            name: 'esegui_calcolo',
            rawText: '{"x": 10, "y": ',
            errorDetail: 'Unexpected end of JSON',
            payload: { raw: '{"x": 10, "y": ' }
          }
        ]
      },
      // Passo 2: in q_repair, l'agente emette la chiamata corretta al tool target
      {
        calls: [
          { id: 'call_repaired', name: 'esegui_calcolo', payload: { x: 10, y: 20 } }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);
    agent.feedPayload({ userContent: { kind: 'text', text: 'Test syntax error.' } });

    // Step 1: syntax_error -> transita in q_repair
    const step1 = await agent.step();
    expect(step1.status).toBe('running');
    expect(agent.getControlState()).toBe('q_repair');

    // Step 2: correzione del tool target -> esegue stepExec e cede il controllo a q_yield
    const step2 = await agent.step();
    expect(step2.status).toBe('yield');
    expect(agent.getControlState()).toBe('q_yield');
    if (step2.status === 'yield') {
      expect(step2.pendingCalls[0].name).toBe('esegui_calcolo');
      expect(step2.pendingCalls[0].payload).toEqual({ x: 10, y: 20 });
    }
  });

  describe('Cognitive Stall & Inability: Gestione formale di q_stall (thinking_budget_exhausted)', () => {
    it('dovrebbe registrare il pensiero parziale in Ep e transitare nello stato terminale q_stall quando infer restituisce uno stall', async () => {
      const stallModel: LanguageModelAdapter = {
        infer: async () => ({
          status: 'stall',
          stall: {
            reason: 'thinking_budget_exhausted',
            partialThought: 'Sto riflettendo ricorsivamente ma ho esaurito il budget...',
            message: 'Limite max_tokens raggiunto durante la deliberazione interna.'
          }
        })
      };

      const agent = runtime.spawnAgent(manifest, stallModel);
      agent.feedPayload({ userContent: { kind: 'text', text: 'Task ad altissima complessità di ragionamento' } });
      expect(agent.getControlState()).toBe('q_exec');

      const stepOutcome = await agent.step();

      // 1. Step restituisce status 'stall' con il dettaglio dello stallo
      expect(stepOutcome.status).toBe('stall');
      if (stepOutcome.status === 'stall') {
        expect(stepOutcome.stall.reason).toBe('thinking_budget_exhausted');
        expect(stepOutcome.stall.partialThought).toBe('Sto riflettendo ricorsivamente ma ho esaurito il budget...');
        expect(stepOutcome.stall.message).toContain('Limite max_tokens');
      }

      // 2. FSM è nello stato terminale q_stall
      expect(agent.getControlState()).toBe('q_stall');

      // 3. Il pensiero parziale è stato registrato nella memoria episodica Ep
      const ep = agent.getState().Ep;
      const recordedThought = ep.find((e) => e.type === 'thought');
      expect(recordedThought).toBeDefined();
      expect(recordedThought?.content).toBe('Sto riflettendo ricorsivamente ma ho esaurito il budget...');

      // 4. Invoking step() di nuovo restituisce in modo idempotente lo stato terminale stall
      const stepAfterTerminal = await agent.step();
      expect(stepAfterTerminal.status).toBe('stall');
      expect(agent.getControlState()).toBe('q_stall');
    });

    it('dovrebbe completare agent.run() restituendo StallRunResult con status="stall"', async () => {
      const stallModel: LanguageModelAdapter = {
        infer: async () => ({
          status: 'stall',
          stall: {
            reason: 'thinking_budget_exhausted',
            partialThought: 'Loop di pensiero interrotto.',
            message: 'finish_reason length'
          }
        })
      };

      const agent = runtime.spawnAgent(manifest, stallModel);
      const runResult = await agent.run({ userContent: { kind: 'text', text: 'Elabora richiesta impossibile' } });

      expect(runResult.status).toBe('stall');
      if (runResult.status === 'stall') {
        expect(runResult.stall.reason).toBe('thinking_budget_exhausted');
        expect(runResult.stall.partialThought).toBe('Loop di pensiero interrotto.');
        expect(runResult.macroCycles).toBe(0);
        expect(runResult.ticks).toBe(1);
      }
      expect(agent.getControlState()).toBe('q_stall');
    });

    it('dovrebbe transitare a q_stall anche se lo stallo cognitivo si verifica durante q_repair', async () => {
      let callCount = 0;
      const model: LanguageModelAdapter = {
        infer: async () => {
          callCount++;
          if (callCount === 1) {
            // Primo step: genera syntax_error portando in q_repair
            return {
              calls: [
                {
                  status: 'syntax_error',
                  id: 'err_call_1',
                  name: 'esegui_calcolo',
                  rawText: '{"x": invalid',
                  errorDetail: 'JSON parse error',
                  payload: { raw: '{"x": invalid' }
                }
              ]
            };
          }
          // Secondo step: in q_repair, esaurisce il budget di pensiero
          return {
            status: 'stall',
            stall: {
              reason: 'thinking_budget_exhausted',
              partialThought: 'Stavo tentando di riparare il payload ma ho esaurito i token.',
              message: 'Token budget exhausted in repair'
            }
          };
        }
      };

      const agent = runtime.spawnAgent(manifest, model);
      agent.feedPayload({ userContent: { kind: 'text', text: 'Test repair stall' } });

      // Step 1: transizione a q_repair
      const s1 = await agent.step();
      expect(s1.status).toBe('running');
      expect(agent.getControlState()).toBe('q_repair');

      // Step 2: stallo cognitivo durante la riparazione -> q_stall
      const s2 = await agent.step();
      expect(s2.status).toBe('stall');
      expect(agent.getControlState()).toBe('q_stall');

      const ep = agent.getState().Ep;
      const lastThought = ep[ep.length - 1];
      expect(lastThought.type).toBe('thought');
      expect(lastThought.content).toBe('Stavo tentando di riparare il payload ma ho esaurito i token.');
    });
  });
});
