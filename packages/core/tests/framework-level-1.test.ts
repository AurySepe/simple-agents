import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  AgentState,
  computeVisibleTools,
  createWorldRegistry,
  FrameworkConfig,
  FrameworkEngine,
  OperationalPolicy,
  SystemFrameProjector,
  TerminationContract,
  WorldTool
} from '../src/index.js';

describe('Livello 1: Istanziazione del FrameworkEngine Immutabile (Ω_op)', () => {
  it('dovrebbe istanziare un FrameworkEngine con configurazione personalizzata e consentire bindWorld', () => {
    const customProjector: SystemFrameProjector = {
      renderFrame: (state: AgentState) => `CUSTOM FRAME: ${state.I}`
    };

    const customPolicy: OperationalPolicy = {
      formatSchemaErrorMessage: (tool, err) => `ERR(${tool}): ${err}`,
      formatSyntaxErrorMessage: (tool, raw, err) => `SYNTAX(${tool}): ${err} [${raw}]`,
      formatDiagnosticPayload: (code, message, details) => ({
        status: 'error',
        code,
        message,
        details
      })
    };

    const config: FrameworkConfig = {
      systemFrameProjector: customProjector,
      policy: customPolicy
    };

    const framework = new FrameworkEngine(config);
    expect(framework).toBeInstanceOf(FrameworkEngine);
    expect(typeof framework.bindWorld).toBe('function');

    const world = createWorldRegistry([]);
    const runtime = framework.bindWorld(world);
    expect(runtime).toBeDefined();
    expect(typeof runtime.spawnAgent).toBe('function');
  });

  describe('Funzione di Visibilità delle Azioni V_Ω(q)', () => {
    const mockTool1: WorldTool = {
      id: 'tool_database',
      description: 'Query database',
      parameters: z.object({ query: z.string() }),
      execute: async () => 'data'
    };

    const mockTool2: WorldTool = {
      id: 'tool_email',
      description: 'Send email',
      parameters: z.object({ to: z.string() }),
      execute: async () => 'sent'
    };

    const world = createWorldRegistry([mockTool1, mockTool2]);

    const termContract: TerminationContract<{ esito: string }> = {
      id: 'termina_operazione',
      description: 'Conclude con successo',
      schema: z.object({ esito: z.string() })
    };

    const manifest: AgentManifest = {
      I: 'Agente di test',
      Ms0: 'Eseguire query',
      Ta0: ['tool_database'], // solo tool_database montato in Ta
      A_term: [termContract]
    };

    const dummyState: AgentState = {
      I: manifest.I,
      Ms: manifest.Ms0,
      Ds: {},
      Ta: new Set(['tool_database']),
      Ka: new Map(),
      Ep: []
    };

    it('in q_exec dovrebbe rendere visibili solo i tool in Ta ∪ A_term', () => {
      const visible = computeVisibleTools('q_exec', dummyState, manifest, world);
      const visibleIds = visible.map((t) => t.id);

      expect(visibleIds).toContain('tool_database');
      expect(visibleIds).toContain('termina_operazione');
      // tool_email non è in Ta, quindi NON deve essere visibile
      expect(visibleIds).not.toContain('tool_email');
      expect(visibleIds).not.toContain('a_abort_call');
    });

    it('in q_repair dovrebbe isolare solo il tool target da correggere e a_abort_call', () => {
      const visible = computeVisibleTools(
        'q_repair',
        dummyState,
        manifest,
        world,
        'tool_database'
      );
      const visibleIds = visible.map((t) => t.id);

      expect(visibleIds).toEqual(['tool_database', 'a_abort_call']);
    });

    it('in q_repair per un contratto di terminazione isola quel contratto e a_abort_call', () => {
      const visible = computeVisibleTools(
        'q_repair',
        dummyState,
        manifest,
        world,
        'termina_operazione'
      );
      const visibleIds = visible.map((t) => t.id);

      expect(visibleIds).toEqual(['termina_operazione', 'a_abort_call']);
    });

    it('negli altri stati (q_sleep, q_yield, q_halt) la visibilità deve essere vuota', () => {
      expect(computeVisibleTools('q_sleep', dummyState, manifest, world)).toEqual([]);
      expect(computeVisibleTools('q_yield', dummyState, manifest, world)).toEqual([]);
      expect(computeVisibleTools('q_halt', dummyState, manifest, world)).toEqual([]);
    });
  });

  describe('Livello 3: Inizializzazione dello Stato dal Manifesto A_op', () => {
    it('dovrebbe istanziare correttamente lo stato S_0 a partire da A_op', () => {
      const framework = new FrameworkEngine();
      const world = createWorldRegistry([]);
      const runtime = framework.bindWorld(world);

      const manifest: AgentManifest = {
        I: 'Identità Operativa',
        Ms0: 'Scopo Iniziale',
        Ds0: { token: 'xyz123', count: 42 },
        Ta0: ['tool_a', 'tool_b'],
        Ka0: [
          { name: 'policy_1', descrizione: 'Politica di sicurezza', corpo: 'Non divulgare token' }
        ],
        A_term: [
          {
            id: 'termina',
            description: 'Fine',
            schema: z.object({ ok: z.boolean() })
          }
        ]
      };

      const mockModel = {
        infer: async () => ({
          calls: [{ id: 'c1', name: 'termina', payload: { ok: true } }] as const
        })
      };

      const agent = runtime.spawnAgent(manifest, mockModel as any);
      const state = agent.getState();

      expect(state.I).toBe('Identità Operativa');
      expect(state.Ms).toBe('Scopo Iniziale');
      expect(state.Ds).toEqual({ token: 'xyz123', count: 42 });
      expect(state.Ta.has('tool_a')).toBe(true);
      expect(state.Ta.has('tool_b')).toBe(true);
      expect(state.Ka.get('policy_1')?.corpo).toBe('Non divulgare token');
      expect(state.Ep).toEqual([]);
      expect(agent.getControlState()).toBe('q_sleep');
    });
  });
});
