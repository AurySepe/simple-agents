import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentState,
  createDefaultFrameworkConfig,
  createRunner,
  defineAgent,
  deserializeAgentState,
  deriveFSMState,
  deriveTimeIndex,
  FrameworkEngine,
  LanguageModelAdapter,
  serializeAgentState,
  StateValidationError,
  TerminationContract
} from '../src/index.js';

describe('Test di Serializzazione Pura, Parsing e Ripristino dell\'Agente', () => {
  describe('1. Serializzazione e Deserializzazione Bidirezionale (serializeAgentState / deserializeAgentState)', () => {
    it('dovrebbe convertire fedelmente Set e Map in strutture JSON-plain e viceversa', () => {
      const state: AgentState = {
        I: 'TestAgent',
        Ms: 'Test Mission',
        Ds: { counter: 42, active: true },
        Ta: new Set(['tool_a', 'tool_b']),
        Ka: new Map([
          ['pol_1', { name: 'pol_1', descrizione: 'Desc 1', corpo: 'Corpo 1' }]
        ]),
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Ciao' },
            tau: { c: 0, t: 0 }
          }
        ]
      };

      const serialized = serializeAgentState(state);

      // Ta deve essere un array nativo, Ka deve essere un array di Concept
      expect(Array.isArray(serialized.Ta)).toBe(true);
      expect(serialized.Ta).toEqual(['tool_a', 'tool_b']);
      expect(Array.isArray(serialized.Ka)).toBe(true);
      expect(serialized.Ka).toHaveLength(1);
      expect(serialized.Ka[0].name).toBe('pol_1');

      // Verifica compatibilità JSON pura
      const jsonString = JSON.stringify(serialized);
      const parsedFromJson = JSON.parse(jsonString);
      expect(parsedFromJson.Ta).toEqual(['tool_a', 'tool_b']);

      // Deserializzazione in AgentState
      const restored = deserializeAgentState(parsedFromJson);
      expect(restored.Ta).toBeInstanceOf(Set);
      expect(restored.Ta.has('tool_a')).toBe(true);
      expect(restored.Ta.has('tool_b')).toBe(true);
      expect(restored.Ka).toBeInstanceOf(Map);
      expect(restored.Ka.get('pol_1')?.corpo).toBe('Corpo 1');
      expect(restored.Ds).toEqual({ counter: 42, active: true });
      expect(restored.Ep).toHaveLength(1);
    });
  });

  describe('2. Derivazione Deterministica dello Stato FSM (deriveFSMState) e Tempo (deriveTimeIndex)', () => {
    const terminations: TerminationContract[] = [
      {
        id: 'a_concluso',
        description: 'Terminazione completata',
        schema: z.object({ esito: z.string() })
      }
    ];

    it('dovrebbe derivare q_sleep quando Ep è vuoto o privo di stimulus', () => {
      const emptyState: AgentState = {
        I: 'Agent',
        Ms: 'Mission',
        Ds: {},
        Ta: new Set(),
        Ka: new Map(),
        Ep: []
      };
      expect(deriveFSMState(emptyState, terminations)).toEqual({ phase: 'q_sleep' });
      expect(deriveTimeIndex(emptyState.Ep)).toEqual({ c: 0, t: 0 });
    });

    it('dovrebbe derivare q_exec quando è presente uno stimolo e non ci sono azioni pendenti', () => {
      const state: AgentState = {
        I: 'Agent',
        Ms: 'Mission',
        Ds: {},
        Ta: new Set(),
        Ka: new Map(),
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Avvia' },
            tau: { c: 0, t: 1 }
          }
        ]
      };
      expect(deriveFSMState(state, terminations)).toEqual({ phase: 'q_exec' });
      expect(deriveTimeIndex(state.Ep)).toEqual({ c: 0, t: 1 });
    });

    it('dovrebbe derivare q_yield con pendingCalls quando ci sono azioni fisiche senza rispettivo result', () => {
      const state: AgentState = {
        I: 'Agent',
        Ms: 'Mission',
        Ds: {},
        Ta: new Set(['w_query']),
        Ka: new Map(),
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Cerca' },
            tau: { c: 0, t: 0 }
          },
          {
            index: 1,
            type: 'action',
            callId: 'call_1',
            content: { name: 'w_query', payload: { q: 'test' } },
            tau: { c: 0, t: 1 }
          }
        ]
      };
      const fsm = deriveFSMState(state, terminations);
      expect(fsm.phase).toBe('q_yield');
      if (fsm.phase === 'q_yield') {
        expect(fsm.pendingCalls).toHaveLength(1);
        expect(fsm.pendingCalls[0].name).toBe('w_query');
        expect(fsm.pendingCalls[0].id).toBe('call_1');
      }
      expect(deriveTimeIndex(state.Ep)).toEqual({ c: 0, t: 2 });
    });

    it('dovrebbe derivare q_repair quando l\'ultimo evento è un errore diagnostico su result', () => {
      const state: AgentState = {
        I: 'Agent',
        Ms: 'Mission',
        Ds: {},
        Ta: new Set(['w_calc']),
        Ka: new Map(),
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Calcola' },
            tau: { c: 0, t: 0 }
          },
          {
            index: 1,
            type: 'action',
            callId: 'call_err',
            content: { name: 'w_calc', payload: { num: 'non-un-numero' } },
            tau: { c: 0, t: 1 }
          },
          {
            index: 2,
            type: 'result',
            callId: 'call_err',
            content: {
              status: 'error',
              code: 'SCHEMA_VALIDATION_ERROR',
              message: 'Tipo non valido'
            },
            tau: { c: 0, t: 1 }
          }
        ]
      };
      const fsm = deriveFSMState(state, terminations);
      expect(fsm.phase).toBe('q_repair');
      if (fsm.phase === 'q_repair') {
        expect(fsm.targetToolId).toBe('w_calc');
        expect(fsm.targetCallId).toBe('call_err');
      }
    });

    it('dovrebbe derivare q_halt quando l\'ultimo evento è un\'azione terminale', () => {
      const state: AgentState = {
        I: 'Agent',
        Ms: 'Mission',
        Ds: {},
        Ta: new Set(),
        Ka: new Map(),
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Chiudi' },
            tau: { c: 0, t: 0 }
          },
          {
            index: 1,
            type: 'action',
            callId: 'call_term',
            content: { name: 'a_concluso', payload: { esito: 'SUCCESSO' } },
            tau: { c: 1, t: 3 }
          }
        ]
      };
      const fsm = deriveFSMState(state, terminations);
      expect(fsm.phase).toBe('q_halt');
      if (fsm.phase === 'q_halt') {
        expect(fsm.exitResult.type).toBe('a_concluso');
        expect(fsm.exitResult.payload).toEqual({ esito: 'SUCCESSO' });
      }
      expect(deriveTimeIndex(state.Ep)).toEqual({ c: 1, t: 4 });
    });
  });

  describe('3. Validazione e Parsing Automatico del Contratto (parseState)', () => {
    const bankingAgentDef = defineAgent({
      identity: 'BankingAgent',
      mission: 'Gestione conto bancario',
      stateSchema: z.object({
        accountNumber: z.string(),
        balance: z.number().min(0)
      }),
      tools: {
        deposit: {
          description: 'Deposita denaro',
          parameters: z.object({ amount: z.number() }),
          returns: z.object({ newBalance: z.number() })
        }
      },
      terminations: {
        completed: {
          description: 'Operazione conclusa',
          schema: z.object({ finalBalance: z.number() })
        }
      }
    });

    it('dovrebbe parsare con successo uno stato conforme e raffinare i tipi', () => {
      const validPayload = {
        I: 'CustomBankingIdentity',
        Ms: 'Missione aggiornata',
        Ds: { accountNumber: 'IT-12345', balance: 100 },
        Ta: ['deposit'],
        Ka: [],
        Ep: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Avvia sessione' },
            tau: { c: 0, t: 0 }
          }
        ]
      };

      const parsed = bankingAgentDef.parseState(validPayload);
      expect(parsed.I).toBe('CustomBankingIdentity');
      expect(parsed.Ds.accountNumber).toBe('IT-12345');
      expect(parsed.Ds.balance).toBe(100);
      expect(parsed.Ta).toEqual(['deposit']);
    });

    it('dovrebbe accettare e parsare direttamente una stringa JSON', () => {
      const validPayload = {
        I: 'BankingAgent',
        Ms: 'Missione',
        Ds: { accountNumber: 'IT-999', balance: 50 },
        Ta: ['deposit'],
        Ep: []
      };

      const jsonStr = JSON.stringify(validPayload);
      const parsed = bankingAgentDef.parseState(jsonStr);
      expect(parsed.Ds.accountNumber).toBe('IT-999');
    });

    it('dovrebbe lanciare StateValidationError se Ds viola lo stateSchema Zod', () => {
      const invalidDsPayload = {
        I: 'BankingAgent',
        Ms: 'Missione',
        Ds: { accountNumber: 'IT-123', balance: -50 }, // Errore: balance < 0
        Ta: ['deposit'],
        Ep: []
      };

      expect(() => bankingAgentDef.parseState(invalidDsPayload)).toThrow(
        StateValidationError
      );
    });

    it('dovrebbe lanciare StateValidationError se Ta contiene tool non dichiarati nel contratto', () => {
      const undeclaredToolPayload = {
        I: 'BankingAgent',
        Ms: 'Missione',
        Ds: { accountNumber: 'IT-123', balance: 100 },
        Ta: ['deposit', 'unauthorized_withdraw'], // Errore: non dichiarato
        Ep: []
      };

      expect(() => bankingAgentDef.parseState(undeclaredToolPayload)).toThrow(
        /Tool 'unauthorized_withdraw' in 'Ta' is not declared/
      );
    });
  });

  describe('4. Test End-to-End: Sospensione, Serializzazione, Ripristino e Prosecuzione', () => {
    it('dovrebbe consentire di fermare l\'esecuzione, serializzare lo stato, ripartire da un nuovo processo e completare la missione', async () => {
      const testLedger: Record<string, number> = { 'ACC-1': 100 };

      const agentDef = defineAgent({
        identity: 'LedgerAgent',
        mission: 'Aggiorna saldo e termina',
        stateSchema: z.object({
          accountId: z.string(),
          totalTransactions: z.number()
        }),
        tools: {
          w_add_credit: {
            description: 'Aggiunge credito al conto',
            parameters: z.object({ accountId: z.string(), amount: z.number() }),
            returns: z.object({ newBalance: z.number() })
          }
        },
        terminations: {
          finish: {
            description: 'Chiudi operazione',
            schema: z.object({ finalTotal: z.number() })
          }
        }
      });

      const implementedAgent = agentDef.implement({
        initialState: { accountId: 'ACC-1', totalTransactions: 0 },
        tools: {
          w_add_credit: async ({ accountId, amount }) => {
            testLedger[accountId] += amount;
            return { newBalance: testLedger[accountId] };
          }
        }
      });

      // Modello simulato:
      // - Al passo 1 invoca w_add_credit
      // - Al passo 2 termina con finish
      let stepCount = 0;
      const model: LanguageModelAdapter = {
        infer: async () => {
          stepCount++;
          if (stepCount === 1) {
            return {
              thought: 'Aggiungo credito di 50 euro',
              calls: [
                {
                  id: 'call_add',
                  name: 'w_add_credit',
                  payload: { accountId: 'ACC-1', amount: 50 }
                }
              ]
            };
          }
          return {
            thought: 'Operazione conclusa',
            calls: [
              {
                id: 'call_finish',
                name: 'finish',
                payload: { finalTotal: testLedger['ACC-1'] }
              }
            ]
          };
        }
      };

      const engine = new FrameworkEngine(createDefaultFrameworkConfig());

      // FASE 1: Avvia l'agente e fallo avanzare solo fino al completamento del primo tool
      const instance = implementedAgent.spawn(engine, model);
      instance.feedPayload({ userContent: { kind: 'text', text: 'Esegui operazione' } });

      // Avanza il primo passo deliberativo: il modello emette w_add_credit e transita direttamente a q_yield
      const step1Outcome = await instance.step();
      expect(step1Outcome.status).toBe('yield');

      // Simuliamo la sospensione dell'agente: serializziamo lo stato mentre è in attesa dei tool in q_yield
      const suspendedSnapshot = instance.getSnapshot();
      const serializedJsonString = JSON.stringify(serializeAgentState(suspendedSnapshot));

      // FASE 2: In un contesto separato (nuova esecuzione), convalidiamo il JSON con il contratto
      const validatedState = implementedAgent.parseState(serializedJsonString);
      expect(validatedState.Ds.accountId).toBe('ACC-1');

      // FASE 3: Riprendiamo l'agente con il RunnerBuilder ripartendo dallo stato serializzato
      const runner = createRunner({ defaultEngine: false })
        .withEngine(engine)
        .withModel(model)
        .withAgent(implementedAgent);

      // runFromState riprende esattamente da q_yield, esegue il tool w_add_credit su W e completa al passo 2 con halt
      const finalResult = await runner.runFromState(validatedState);

      expect(finalResult.status).toBe('halt');
      if (finalResult.status === 'halt') {
        expect(finalResult.result.type).toBe('finish');
        expect(finalResult.result.payload).toEqual({ finalTotal: 150 });
        expect(testLedger['ACC-1']).toBe(150);
        // I tick e macrocicli devono essere avanzati coerentemente
        expect(finalResult.ticks).toBeGreaterThanOrEqual(2);
      }
    });

    it('dovrebbe sospendere l\'esecuzione in modo pulito con AbortSignal e consentire il ripristino successivo', async () => {
      const agentDef = defineAgent({
        identity: 'AbortableAgent',
        mission: 'Esegui calcoli',
        tools: {
          step_tool: {
            description: 'Passo computazionale',
            parameters: z.object({ step: z.number() })
          }
        },
        terminations: {
          done: {
            description: 'Completato',
            schema: z.object({ ok: z.boolean() })
          }
        }
      });

      let currentStep = 0;
      const executedTools: number[] = [];
      const abortController = new AbortController();

      const implemented = agentDef.implement({
        tools: {
          step_tool: async ({ step }) => {
            executedTools.push(step);
            // Al termine del primo tool, richiediamo l'abort per sospendere prima del secondo passo
            if (step === 1) {
              abortController.abort();
            }
          }
        }
      });

      const model: LanguageModelAdapter = {
        infer: async () => {
          currentStep++;
          if (currentStep === 1) {
            return {
              calls: [{ id: 'c1', name: 'step_tool', payload: { step: 1 } }]
            };
          }
          if (currentStep === 2) {
            return {
              calls: [{ id: 'c2', name: 'step_tool', payload: { step: 2 } }]
            };
          }
          return {
            calls: [{ id: 'c3', name: 'done', payload: { ok: true } }]
          };
        }
      };

      const engine = new FrameworkEngine(createDefaultFrameworkConfig());
      const runner = createRunner({ defaultEngine: false })
        .withEngine(engine)
        .withModel(model)
        .withAgent(implemented);

      // Prima esecuzione con segnale di abort
      const runOutcome = await runner.run({
        userContent: { kind: 'text', text: 'Avvia' },
        signal: abortController.signal
      });

      // Deve essersi sospeso in modo controllato senza lanciare eccezioni
      expect(runOutcome.status).toBe('suspended');
      if (runOutcome.status === 'suspended') {
        expect(runOutcome.reason).toBe('aborted');
        expect(executedTools).toEqual([1]);

        // Lo stato è intatto e serializzabile!
        const snapshot = runOutcome.state;
        const serialized = serializeAgentState(snapshot);
        const json = JSON.stringify(serialized);

        // Ora riprendiamo in un nuovo runner senza abort signal
        const restoredState = implemented.parseState(json);
        const finalResult = await runner.runFromState(restoredState);

        expect(finalResult.status).toBe('halt');
        if (finalResult.status === 'halt') {
          expect(finalResult.result.type).toBe('done');
          expect(executedTools).toEqual([1, 2]);
        }
      }
    });

    it('dovrebbe sospendere l\'esecuzione restituendo lo stato quando si supera maxMacroCycles', async () => {
      const agentDef = defineAgent({
        identity: 'LoopAgent',
        mission: 'Loop infinito',
        tools: {
          ping: {
            description: 'Ping',
            parameters: z.object({})
          }
        },
        terminations: {
          exit: {
            description: 'Uscita',
            schema: z.object({})
          }
        }
      });

      const implemented = agentDef.implement({
        tools: { ping: async () => ({}) }
      });

      const model: LanguageModelAdapter = {
        infer: async () => ({
          calls: [{ id: 'p', name: 'ping', payload: {} }]
        })
      };

      const engine = new FrameworkEngine(createDefaultFrameworkConfig());
      const runner = createRunner({ defaultEngine: false })
        .withEngine(engine)
        .withModel(model)
        .withAgent(implemented);

      const outcome = await runner.run({
        userContent: { kind: 'text', text: 'Ping' },
        maxMacroCycles: 2
      });

      expect(outcome.status).toBe('suspended');
      if (outcome.status === 'suspended') {
        expect(outcome.reason).toBe('cycle_limit');
        expect(outcome.state).toBeDefined();
        expect(outcome.macroCycles).toBeGreaterThan(2);
      }
    });

    it('dovrebbe consentire di risvegliare l\'agente da uno stato di halt con un nuovo stimulus mantenendo la memoria pregressa', async () => {
      const agentDef = defineAgent({
        identity: 'ConversationalAgent',
        mission: 'Assistente a memoria continua',
        stateSchema: z.object({
          topic: z.string()
        }),
        tools: {
          remember: {
            description: 'Salva informazione',
            parameters: z.object({ note: z.string() })
          }
        },
        terminations: {
          reply: {
            description: 'Risponde all\'utente e conclude il turno',
            schema: z.object({ message: z.string() })
          }
        }
      });

      const notes: string[] = [];
      const implemented = agentDef.implement({
        initialState: { topic: 'Coding' },
        tools: {
          remember: async ({ note }) => {
            notes.push(note);
          }
        }
      });

      let turn = 0;
      const model: LanguageModelAdapter = {
        infer: async (ctx) => {
          turn++;
          if (turn === 1) {
            // Turno 1: invoca remember e termina con reply
            return {
              calls: [
                { id: 'r1', name: 'remember', payload: { note: 'Linguaggio TypeScript' } }
              ]
            };
          }
          if (turn === 2) {
            return {
              calls: [
                { id: 'rep1', name: 'reply', payload: { message: 'Ho memorizzato il linguaggio.' } }
              ]
            };
          }
          if (turn === 3) {
            // Turno 2 (dopo halt): il modello riceve il nuovo stimolo e vede tutti i messaggi passati!
            expect(ctx.messages.length).toBeGreaterThanOrEqual(4);
            return {
              calls: [
                { id: 'rep2', name: 'reply', payload: { message: 'Risposta al secondo turno.' } }
              ]
            };
          }
          throw new Error('Unexpected turn');
        }
      };

      const engine = new FrameworkEngine(createDefaultFrameworkConfig());
      const runner = createRunner({ defaultEngine: false })
        .withEngine(engine)
        .withModel(model)
        .withAgent(implemented);

      // TURNO 1
      const turn1Result = await runner.run({
        userContent: { kind: 'text', text: 'Primo messaggio' }
      });

      expect(turn1Result.status).toBe('halt');
      expect(notes).toEqual(['Linguaggio TypeScript']);
      if (turn1Result.status === 'halt') {
        expect(turn1Result.result.payload).toEqual({ message: 'Ho memorizzato il linguaggio.' });

        // Serializziamo lo stato dell'agente dopo che è andato in halt
        const serializedJson = JSON.stringify(serializeAgentState(turn1Result.state));

        // TURNO 2: Ripartiamo dallo stato serializzato in halt, passando un nuovo stimulus!
        const parsedState = implemented.parseState(serializedJson);
        const turn2Result = await runner.runFromState(parsedState, {
          userContent: { kind: 'text', text: 'Secondo messaggio' }
        });

        // Deve completarsi con successo senza errori e mantenendo la memoria
        expect(turn2Result.status).toBe('halt');
        if (turn2Result.status === 'halt') {
          expect(turn2Result.result.payload).toEqual({ message: 'Risposta al secondo turno.' });
          expect(turn2Result.state.Ep.length).toBeGreaterThan(turn1Result.state.Ep.length);
          expect(turn2Result.state.Ds.topic).toBe('Coding');
        }
      }
    });
  });
});
