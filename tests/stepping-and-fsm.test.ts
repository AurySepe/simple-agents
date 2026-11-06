import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  BoundRuntime,
  CognitiveTool,
  CognitiveToolkit,
  createWorldRegistry,
  FrameworkConfig,
  FrameworkEngine,
  LanguageModelAdapter,
  ModelOutput,
  OrchestratorPolicy,
  SystemFrameProjector,
  WorldRegistry
} from '../src/index.js';

describe('Automa a Stati Finiti: Stepping (step) e Resumption (resume)', () => {
  const dummyTool = (id: string): CognitiveTool => ({
    id,
    description: `Dummy ${id}`,
    parameters: z.object({}),
    execute: () => {}
  });

  // Configurazione del Framework (Livello 1) con il CognitiveToolkit completo
  const cognitiveTools: CognitiveToolkit = {
    aggiorna_missione: {
      id: 'aggiorna_missione',
      description: 'Aggiorna Ms',
      parameters: z.object({ nuovo_scopo: z.string() }),
      execute: (args, state) => {
        state.Ms = args.nuovo_scopo;
      }
    },
    imposta_dato: dummyTool('imposta_dato'),
    elimina_dato: dummyTool('elimina_dato'),
    compatta_memoria: dummyTool('compatta_memoria'),
    cerca_tool: dummyTool('cerca_tool'),
    carica_tool: dummyTool('carica_tool'),
    scarica_tool: dummyTool('scarica_tool'),
    cerca_concetti: dummyTool('cerca_concetti'),
    carica_concetto: dummyTool('carica_concetto'),
    scarica_concetto: dummyTool('scarica_concetto')
  };

  const systemFrameProjector: SystemFrameProjector = (directive, state) => {
    return `[PROJECTION] Ms: ${state.Ms}`;
  };

  const policy: OrchestratorPolicy = {
    formatDirectivePrompt: (type) => `DIR:${type}`,
    formatSchemaErrorPrompt: (tool, err) => `ERR:${tool}:${err}`,
    formatSyntaxErrorPrompt: (tool, raw, err) => `ERR_SYNTAX:${tool}:${raw}:${err}`,
    formatDirectiveMessageContent: (dir) => `[DIRECTIVE:${dir.type}]`,
    formatAbortResultContent: (tool) => `[ABORTED:${tool}]`,
    formatVoidResultContent: () => 'OK',
    formatControlActionDescription: (action) => `Action:${action}`,
    formatInternalErrorDetail: (kind, context) => `Err:${kind}:${context?.toolId ?? ''}`,
    validationMessages: {
      nuovo_scopo_required: 'Scopo richiesto',
      chiave_required: 'Chiave richiesta',
      query_required: 'Query richiesta',
      tool_ids_required: 'Tool ids richiesti',
      concetto_ids_required: 'Concetto ids richiesti',
      sintesi_required: 'Sintesi richiesta',
      invalid_indices: 'Indici non validi'
    },
    cognitiveMetadata: {
      aggiorna_missione: { toolName: 'aggiorna_missione', description: 'Aggiorna Ms' },
      imposta_dato: { toolName: 'imposta_dato', description: 'Imposta Ds' },
      elimina_dato: { toolName: 'elimina_dato', description: 'Elimina Ds' },
      compatta_memoria: { toolName: 'compatta_memoria', description: 'Compatta Ep' },
      cerca_tool: { toolName: 'cerca_tool', description: 'Cerca tool' },
      carica_tool: { toolName: 'carica_tool', description: 'Carica tool' },
      scarica_tool: { toolName: 'scarica_tool', description: 'Scarica tool' },
      cerca_concetti: { toolName: 'cerca_concetti', description: 'Cerca concetti' },
      carica_concetto: { toolName: 'carica_concetto', description: 'Carica concetto' },
      scarica_concetto: { toolName: 'scarica_concetto', description: 'Scarica concetto' }
    }
  };

  const frameworkConfig: FrameworkConfig = {
    cognitiveTools,
    systemFrameProjector,
    policy
  };

  const engine = new FrameworkEngine(frameworkConfig);

  // Registro del Mondo (Livello 2)
  const mockWorld = createWorldRegistry([]);
  const runtime: BoundRuntime = engine.bindWorld(mockWorld);

  // Manifesto dell'Agente (Livello 3)
  const manifest: AgentManifest = {
    I: 'Agente di test FSM',
    Ms0: 'In attesa di istruzioni',
    A_int: new Set(['aggiorna_missione']),
    A_term: [
      {
        id: 'rispondi_e_termina',
        description: 'Risposta finale al cliente',
        schema: z.object({ messaggio: z.string() })
      }
    ]
  };

  it('dovrebbe avanzare micro-passo per micro-passo tramite step() rispettando gli stati FSM', async () => {
    // Mock di un modello a risposte sequenziali
    const responses: ModelOutput[] = [
      // Passo 1: In q_intro, esegue aggiorna_missione
      {
        thought: 'Devo aggiornare la mia missione interna.',
        calls: [
          {
            id: 'call_1',
            name: 'aggiorna_missione',
            payload: { nuovo_scopo: 'Elaborazione avviata' }
          }
        ]
      },
      // Passo 2: In q_intro, conclude l'introspezione
      {
        thought: 'Introspezione completata.',
        calls: [
          {
            id: 'call_2',
            name: 'a_concludi_intro',
            payload: {}
          }
        ]
      },
      // Passo 3: In q_exec, termina il task con rispondi_e_termina
      {
        thought: 'Completato con successo.',
        calls: [
          {
            id: 'call_3',
            name: 'rispondi_e_termina',
            payload: { messaggio: 'Task finito!' }
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
    expect(agent.canStep()).toBe(false);

    // 1. Invio payload (feedPayload senza resume)
    agent.feedPayload({ userContent: 'Ciao, avvia il processo.' });
    expect(agent.getControlState()).toBe('q_intro');
    expect(agent.canStep()).toBe(true);
    expect(agent.getTimeIndex()).toEqual({ c: 0, t: 0 });

    // 2. Micro-passo 1 (step): esecuzione aggiorna_missione
    const step1 = await agent.step();
    expect(step1.status).toBe('running');
    if (step1.status === 'running') {
      expect(step1.controlState).toBe('q_intro');
      expect(step1.tick).toBe(1);
      expect(step1.state.Ms).toBe('Elaborazione avviata');
    }
    expect(agent.getControlState()).toBe('q_intro');

    // 3. Micro-passo 2 (step): a_concludi_intro
    const step2 = await agent.step();
    expect(step2.status).toBe('running');
    if (step2.status === 'running') {
      expect(step2.controlState).toBe('q_exec');
      expect(step2.tick).toBe(2);
    }
    expect(agent.getControlState()).toBe('q_exec');

    // 4. Micro-passo 3 (step): terminazione tipizzata
    const step3 = await agent.step();
    expect(step3.status).toBe('halt');
    if (step3.status === 'halt') {
      expect(step3.result.type).toBe('rispondi_e_termina');
      expect(step3.result.payload).toEqual({ messaggio: 'Task finito!' });
      expect(step3.tick).toBe(3);
    }
    expect(agent.getControlState()).toBe('q_halt');
    expect(agent.canStep()).toBe(false);
  });

  it('dovrebbe consentire il resume() continuativo a partire da uno stato intermedio sospeso', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: aggiorna_missione
      {
        calls: [
          {
            id: 'call_1',
            name: 'aggiorna_missione',
            payload: { nuovo_scopo: 'Fase intermedia' }
          }
        ]
      },
      // Passo 2: conclude intro
      {
        calls: [{ id: 'call_2', name: 'a_concludi_intro', payload: {} }]
      },
      // Passo 3: termina
      {
        calls: [
          {
            id: 'call_3',
            name: 'rispondi_e_termina',
            payload: { messaggio: 'Tutto fatto.' }
          }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);

    agent.feedPayload({ userContent: 'Inizia.' });

    // Eseguiamo solo 1 step: l'agente è ora a metà dell'introspezione
    const outcome1 = await agent.step();
    expect(outcome1.status).toBe('running');
    expect(agent.getControlState()).toBe('q_intro');
    expect(agent.getState().Ms).toBe('Fase intermedia');

    // Ora risvegliamo/continuiamo la computazione con resume()
    const finalOutcome = await agent.resume();
    expect(finalOutcome.status).toBe('halt');
    if (finalOutcome.status === 'halt') {
      expect(finalOutcome.result.type).toBe('rispondi_e_termina');
      expect(finalOutcome.result.payload).toEqual({ messaggio: 'Tutto fatto.' });
    }
    expect(agent.getControlState()).toBe('q_halt');
  });

  it('dovrebbe gestire la transizione a q_repair e recuperare con a_abort_call tramite step()', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: Errore di violazione XOR (emette sia concludi che un altro tool)
      {
        calls: [
          { id: 'c1', name: 'a_concludi_intro', payload: {} },
          { id: 'c2', name: 'aggiorna_missione', payload: { nuovo_scopo: 'X' } }
        ]
      },
      // Passo 2: In q_repair, l'agente esegue a_abort_call
      {
        calls: [
          { id: 'c3', name: 'a_abort_call', payload: {} }
        ]
      },
      // Passo 3: Ritorna a q_intro, esegue a_concludi_intro valida
      {
        calls: [
          { id: 'c4', name: 'a_concludi_intro', payload: {} }
        ]
      },
      // Passo 4: In q_exec, termina
      {
        calls: [
          { id: 'c5', name: 'rispondi_e_termina', payload: { messaggio: 'Riparato.' } }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);
    agent.feedPayload({ userContent: 'Test riparazione.' });

    // Step 1: invia violazione XOR -> transizione a q_repair
    const step1 = await agent.step();
    expect(step1.status).toBe('running');
    expect(agent.getControlState()).toBe('q_repair');

    // Step 2: esegue a_abort_call -> transizione a q_intro
    const step2 = await agent.step();
    expect(step2.status).toBe('running');
    expect(agent.getControlState()).toBe('q_intro');

    // Step 3: conclude intro -> transizione a q_exec
    const step3 = await agent.step();
    expect(step3.status).toBe('running');
    expect(agent.getControlState()).toBe('q_exec');

    // Step 4: termina in q_exec -> transizione a q_halt
    const step4 = await agent.step();
    expect(step4.status).toBe('halt');
    expect(agent.getControlState()).toBe('q_halt');
  });

  it('dovrebbe gestire la transizione a q_repair in presenza di un syntax_error negli argomenti del tool', async () => {
    const responses: ModelOutput[] = [
      // Passo 1: Chiama concludi ma con errore di sintassi
      {
        calls: [
          {
            status: 'syntax_error',
            id: 'err_call_1',
            name: 'a_concludi_intro',
            rawText: '{"incompleto":',
            errorDetail: 'Unexpected end of JSON',
            payload: { raw: '{"incompleto":' }
          }
        ]
      },
      // Passo 2: In q_repair, l'agente recupera ed emette chiamata valida
      {
        calls: [
          { id: 'c_valid', name: 'a_concludi_intro', payload: {} }
        ]
      },
      // Passo 3: In q_exec, termina
      {
        calls: [
          { id: 'c_term', name: 'rispondi_e_termina', payload: { messaggio: 'Recuperato da errore sintassi.' } }
        ]
      }
    ];

    let callIndex = 0;
    const model: LanguageModelAdapter = {
      infer: async () => responses[callIndex++]
    };

    const agent = runtime.spawnAgent(manifest, model);
    agent.feedPayload({ userContent: 'Test syntax error.' });

    // Step 1: invia chiamata con syntax_error -> transita in q_repair con err_syntax
    const step1 = await agent.step();
    expect(step1.status).toBe('running');
    expect(agent.getControlState()).toBe('q_repair');
    const directive = agent.getCurrentDirective();
    expect(directive?.type).toBe('err_syntax');
    if (directive?.type === 'err_syntax') {
      expect(directive.rawText).toBe('{"incompleto":');
      expect(directive.targetToolId).toBe('a_concludi_intro');
    }

    // Step 2: retry valido -> transita a q_intro
    const step2 = await agent.step();
    expect(step2.status).toBe('running');
    expect(agent.getControlState()).toBe('q_intro');
  });
});
