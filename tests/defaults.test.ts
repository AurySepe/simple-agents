import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  AgentState,
  createDefaultCognitiveToolkit,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  defaultEnglishPolicy,
  defaultItalianPolicy,
  defaultMarkdownProjector,
  defaultXmlProjector,
  FrameworkEngine,
  LanguageModelAdapter,
  WorldRegistry
} from '../src/index.js';

describe('Standard Library / Defaults di Livello 1', () => {
  it('dovrebbe istanziare un FrameworkEngine con una sola riga tramite createDefaultFrameworkConfig()', () => {
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    expect(framework).toBeInstanceOf(FrameworkEngine);
  });

  it('dovrebbe consentire l override selettivo del proiettore e della policy linguistica con messaggi in inglese', () => {
    const config = createDefaultFrameworkConfig({
      projector: defaultXmlProjector,
      policy: defaultEnglishPolicy
    });

    expect(config.systemFrameProjector).toBe(defaultXmlProjector);
    expect(config.policy).toBe(defaultEnglishPolicy);

    // Verifica che lo schema sia stato generato con il messaggio di validazione in inglese della policy
    const parseResult = config.cognitiveTools.aggiorna_missione.parameters.safeParse({ nuovo_scopo: '' });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      expect(JSON.stringify(parseResult.error.format())).toContain(
        defaultEnglishPolicy.validationMessages.nuovo_scopo_required
      );
    }
  });

  describe('Cognitive Tools di Default (In-Memory)', () => {
    it('dovrebbe eseguire correttamente le mutazioni di stato in-memory', async () => {
      const toolkit = createDefaultCognitiveToolkit();
      const state: AgentState = {
        I: 'Agente Test',
        Ms: 'Scopo iniziale',
        Ds: {},
        Ta: new Set(),
        Ka: new Map(),
        Ep: []
      };

      // 1. aggiorna_missione
      toolkit.aggiorna_missione.execute({ nuovo_scopo: 'Nuovo scopo' }, state);
      expect(state.Ms).toBe('Nuovo scopo');

      // 2. imposta_dato
      toolkit.imposta_dato.execute({ chiave: 'session_id', valore: 12345 }, state);
      expect(state.Ds['session_id']).toBe(12345);

      // 3. elimina_dato
      toolkit.elimina_dato.execute({ chiave: 'session_id' }, state);
      expect(state.Ds['session_id']).toBeUndefined();

      // 4. carica_tool e scarica_tool
      toolkit.carica_tool.execute({ tool_ids: ['tool_api_1', 'tool_api_2'] }, state);
      expect(state.Ta.has('tool_api_1')).toBe(true);
      expect(state.Ta.has('tool_api_2')).toBe(true);

      toolkit.scarica_tool.execute({ tool_ids: ['tool_api_1'] }, state);
      expect(state.Ta.has('tool_api_1')).toBe(false);
      expect(state.Ta.has('tool_api_2')).toBe(true);

      // 5. carica_concetto e scarica_concetto
      toolkit.carica_concetto.execute({ concetto_ids: ['c_policy_reso'] }, state);
      expect(state.Ka.has('c_policy_reso')).toBe(true);

      toolkit.scarica_concetto.execute({ concetto_ids: ['c_policy_reso'] }, state);
      expect(state.Ka.has('c_policy_reso')).toBe(false);

      // 6. compatta_memoria
      state.Ep = [
        { index: 0, role: 'user', channel: 'payload', content: 'Msg 0' },
        { index: 1, role: 'agent', channel: 'thought', content: 'Msg 1' },
        { index: 2, role: 'agent', channel: 'call', content: 'Msg 2' },
        { index: 3, role: 'world', channel: 'result', content: 'Msg 3' },
        { index: 4, role: 'user', channel: 'payload', content: 'Msg 4' }
      ];

      toolkit.compatta_memoria.execute(
        { start_idx: 1, end_idx: 3, sintesi: 'Riassunto chiamate intermedie' },
        state
      );

      // [Msg 0] + [Sommario] + [Msg 4] = 3 messaggi
      expect(state.Ep.length).toBe(3);
      expect(state.Ep[0].content).toBe('Msg 0');
      expect(state.Ep[1].channel).toBe('summary');
      expect(state.Ep[1].content).toBe('Riassunto chiamate intermedie');
      expect(state.Ep[2].content).toBe('Msg 4');
    });
  });

  describe('Proiettori di Default', () => {
    const dummyState: AgentState = {
      I: 'Sei un assistente virtuale.',
      Ms: 'Assistere il cliente',
      Ds: { orderId: 'ORD-999' },
      Ta: new Set(['calcola_totale']),
      Ka: new Map([
        ['concetto_1', { id: 'concetto_1', descrizione: 'Politica resi', corpo: 'Resi entro 30gg' }]
      ]),
      Ep: []
    };

    it('dovrebbe proiettare lo stato in Markdown', () => {
      const output = defaultMarkdownProjector({ type: 'start_intro', prompt: 'test' }, dummyState);
      expect(output).toContain('# IDENTITÀ:');
      expect(output).toContain('## OBIETTIVO CORRENTE:');
      expect(output).toContain('ORD-999');
      expect(output).toContain('calcola_totale');
      expect(output).toContain('Politica resi');
    });

    it('dovrebbe proiettare lo stato in XML', () => {
      const output = defaultXmlProjector({ type: 'start_intro', prompt: 'test' }, dummyState);
      expect(output).toContain('<identity>');
      expect(output).toContain('<current_mission>');
      expect(output).toContain('<structured_data>');
      expect(output).toContain('<mounted_tools>');
      expect(output).toContain('<active_concepts>');
    });
  });

  describe('End-to-End con i Default', () => {
    it('dovrebbe eseguire un ciclo completo agente con i moduli di default', async () => {
      const framework = new FrameworkEngine(createDefaultFrameworkConfig());
      const mockWorld = createWorldRegistry([]);
      const runtime = framework.bindWorld(mockWorld);

      const manifest: AgentManifest = {
        I: 'Agente Default',
        Ms0: 'Inizio',
        A_int: new Set(['aggiorna_missione']),
        A_term: [
          {
            id: 'termina',
            description: 'Conclude',
            schema: z.object({ esito: z.string() })
          }
        ]
      };

      const model: LanguageModelAdapter = {
        infer: async (ctx) => {
          // Passo 1: se Ms non è ancora aggiornato, chiamiamo aggiorna_missione (che ha ritorno void)
          const stateMs = ctx.systemFrame.includes('Ms aggiornata');
          if (!stateMs && ctx.visibleTools.some((t) => t.id === 'aggiorna_missione')) {
            return {
              calls: [
                {
                  id: 'call_void_1',
                  name: 'aggiorna_missione',
                  payload: { nuovo_scopo: 'Ms aggiornata' }
                }
              ]
            };
          }
          // Passo 2: concludiamo intro
          if (ctx.visibleTools.some((t) => t.id === 'a_concludi_intro')) {
            return { calls: [{ id: 'c1', name: 'a_concludi_intro', payload: {} }] };
          }
          // Passo 3: in exec, terminiamo
          return { calls: [{ id: 'c2', name: 'termina', payload: { esito: 'Perfetto' } }] };
        }
      };

      const agent = runtime.spawnAgent(manifest, model);
      const outcome = await agent.wakeup({ userContent: 'Esegui il task.' });

      expect(outcome.status).toBe('halt');
      if (outcome.status === 'halt') {
        expect(outcome.result.type).toBe('termina');
        expect(outcome.result.payload).toEqual({ esito: 'Perfetto' });
      }

      // Verifica formale: la chiamata a ritorno void ha prodotto content: 'OK' dichiarato a Livello 1
      const voidResultMsg = agent.getState().Ep.find(
        (m) => m.channel === 'result' && m.callId === 'call_void_1'
      );
      expect(voidResultMsg).toBeDefined();
      expect(voidResultMsg?.content).toBe('OK');
    });

    it('dovrebbe garantire la portabilità del Manifesto traducendo le chiamate LLM in inglese verso le costanti interne', async () => {
      // Configuriamo il framework in inglese
      const framework = new FrameworkEngine(
        createDefaultFrameworkConfig({ policy: defaultEnglishPolicy })
      );
      const mockWorld = createWorldRegistry([]);
      const runtime = framework.bindWorld(mockWorld);

      // Lo STESSO Manifesto identico (con permessi espressi nelle costanti canoniche del codice)
      const portableManifest: AgentManifest = {
        I: 'International Agent',
        Ms0: 'Initial Mission',
        A_int: new Set(['aggiorna_missione']), // Costante canonica stabile!
        A_term: [
          {
            id: 'finish',
            description: 'Finish',
            schema: z.object({ result: z.string() })
          }
        ]
      };

      let visibleToolIds: string[] = [];

      const model: LanguageModelAdapter = {
        infer: async (ctx) => {
          visibleToolIds = ctx.visibleTools.map((t) => t.id);

          // Il modello vede ed emette 'update_mission' (il nome in inglese fornito dalla policy)!
          const updated = ctx.systemFrame.includes('Goal updated in English');
          if (!updated && ctx.visibleTools.some((t) => t.id === 'update_mission')) {
            return {
              calls: [
                {
                  id: 'call_en_1',
                  name: 'update_mission',
                  payload: { nuovo_scopo: 'Goal updated in English' }
                }
              ]
            };
          }
          if (ctx.visibleTools.some((t) => t.id === 'a_concludi_intro')) {
            return { calls: [{ id: 'c_end', name: 'a_concludi_intro', payload: {} }] };
          }
          return { calls: [{ id: 'c_term', name: 'finish', payload: { result: 'Done' } }] };
        }
      };

      const agent = runtime.spawnAgent(portableManifest, model);
      agent.feedPayload({ userContent: 'Start task.' });

      // Eseguiamo il primo step: deve mostrare 'update_mission' all'LLM ed eseguire la mutazione di 'aggiorna_missione'
      const outcome1 = await agent.step();
      expect(outcome1.status).toBe('running');

      // Verifica 1: all'LLM è stato esposto 'update_mission' e NON la chiave interna
      expect(visibleToolIds).toContain('update_mission');
      expect(visibleToolIds).not.toContain('aggiorna_missione');

      // Verifica 2: l'Orchestratore ha mappato 'update_mission' -> 'aggiorna_missione',
      // autorizzato dal Manifesto e mutando regolarmente Ms!
      expect(agent.getState().Ms).toBe('Goal updated in English');

      // Proseguiamo fino a termine
      const finalOutcome = await agent.resume();
      expect(finalOutcome.status).toBe('halt');
    });
  });
});

