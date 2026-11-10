import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDefaultFrameworkConfig,
  createEvaluationCollector,
  createWorldRegistry,
  defineAgent,
  FrameworkEngine,
  LanguageModelAdapter
} from '../src/index.js';

describe('Discriminated Union Results & Robust Error Handling', () => {
  describe('Punto 1: StateParseResult in parseState', () => {
    const agentDef = defineAgent({
      identity: 'ValidationAgent',
      mission: 'Test validazione pura',
      stateSchema: z.object({
        count: z.number().min(0),
        tag: z.string()
      }),
      tools: {
        ping: {
          description: 'Ping',
          parameters: z.object({ msg: z.string() })
        }
      },
      terminations: {
        done: {
          description: 'Finito',
          schema: z.object({})
        }
      }
    });

    it('dovrebbe restituire NOT_AN_OBJECT per input non-oggetto', () => {
      expect(agentDef.parseState('stringa')).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_AN_OBJECT' })
      });
      expect(agentDef.parseState(123)).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_AN_OBJECT' })
      });
      expect(agentDef.parseState(null)).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_AN_OBJECT' })
      });
    });

    it('dovrebbe restituire INVALID_IDENTITY se I è assente o vuoto', () => {
      const res = agentDef.parseState({
        I: '',
        Ms: 'Mission',
        Ds: { count: 1, tag: 'a' },
        Ta: ['ping'],
        Ep: []
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INVALID_IDENTITY');
      }
    });

    it('dovrebbe restituire SCHEMA_VIOLATION se Ds viola lo stateSchema Zod', () => {
      const res = agentDef.parseState({
        I: 'ValidationAgent',
        Ms: 'Mission',
        Ds: { count: -10, tag: 'err' }, // min(0) violato
        Ta: ['ping'],
        Ep: []
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SCHEMA_VIOLATION');
        expect(res.error.details).toBeDefined();
      }
    });

    it('dovrebbe restituire UNDECLARED_TOOL se Ta include tool non autorizzati', () => {
      const res = agentDef.parseState({
        I: 'ValidationAgent',
        Ms: 'Mission',
        Ds: { count: 1, tag: 'ok' },
        Ta: ['ping', 'unauthorized_hack'],
        Ep: []
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('UNDECLARED_TOOL');
      }
    });

    it('dovrebbe restituire ok: true e TypedAgentState conforme in caso di successo', () => {
      const res = agentDef.parseState({
        I: 'ValidationAgent',
        Ms: 'Mission',
        Ds: { count: 5, tag: 'valid' },
        Ta: ['ping'],
        Ep: []
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.state.Ds.count).toBe(5);
        expect(res.state.Ds.tag).toBe('valid');
      }
    });
  });

  describe('Punto 3: ToolExecutionResult in WorldRegistry.executeTool', () => {
    const world = createWorldRegistry([
      {
        id: 'divide',
        description: 'Divisione sicura',
        parameters: z.object({ a: z.number(), b: z.number().refine((n) => n !== 0, 'Cannot divide by zero') }),
        execute: async ({ a, b }) => {
          return { quotient: a / b };
        }
      },
      {
        id: 'failing_tool',
        description: 'Lancia un errore asincrono',
        parameters: z.object({}),
        execute: async () => {
          throw new Error('Database connection failed');
        }
      }
    ]);

    it('dovrebbe restituire TOOL_NOT_FOUND per tool inesistenti', async () => {
      const res = await world.executeTool('non_existent', {});
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('TOOL_NOT_FOUND');
        expect(res.error.toolId).toBe('non_existent');
      }
    });

    it('dovrebbe restituire SCHEMA_VALIDATION_ERROR se gli argomenti violano i parametri Zod', async () => {
      const res = await world.executeTool('divide', { a: 10, b: 0 });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('SCHEMA_VALIDATION_ERROR');
        expect(res.error.toolId).toBe('divide');
        expect(res.error.details).toBeDefined();
      }
    });

    it('dovrebbe restituire EXECUTION_REJECTED se l\'esecutore asincrono lancia un\'eccezione', async () => {
      const res = await world.executeTool('failing_tool', {});
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('EXECUTION_REJECTED');
        expect(res.error.toolId).toBe('failing_tool');
        expect(res.error.message).toContain('Database connection failed');
      }
    });

    it('dovrebbe restituire ok: true e data per esecuzione riuscita', async () => {
      const res = await world.executeTool('divide', { a: 10, b: 2 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toEqual({ quotient: 5 });
      }
    });
  });

  describe('Punto 4: Gestione errori tipizzata in run() ed Orchestrator', () => {
    it('dovrebbe restituire status: error con TOOL_EXECUTION_ERROR se un tool fisico fallisce durante run()', async () => {
      const agentDef = defineAgent({
        identity: 'FailingWorldAgent',
        mission: 'Invoca un tool che fallisce',
        tools: {
          crash_tool: {
            description: 'Crash',
            parameters: z.object({})
          }
        },
        terminations: {
          finish: {
            description: 'Fine',
            schema: z.object({})
          }
        }
      });

      const implemented = agentDef.implement({
        tools: {
          crash_tool: async () => {
            throw new Error('Hardware I/O timeout');
          }
        }
      });

      const model: LanguageModelAdapter = {
        infer: async () => ({
          calls: [{ id: 'c1', name: 'crash_tool', payload: {} }]
        })
      };

      const collector = createEvaluationCollector(implemented);
      const engine = new FrameworkEngine(createDefaultFrameworkConfig());
      const outcome = await implemented.run(engine, model, {
        userContent: 'Start',
        observers: [collector]
      });

      // L'agente non lancia eccezioni non intercettate, ma ritorna status: 'error' tipizzato
      expect(outcome.status).toBe('error');
      if (outcome.status === 'error') {
        expect(outcome.error.code).toBe('TOOL_EXECUTION_ERROR');
        expect(outcome.error.message).toContain('Hardware I/O timeout');
        expect(outcome.macroCycles).toBe(0);
        expect(outcome.ticks).toBe(1);
      }

      // Anche l'EvaluationCollector registra lo status di errore
      const report = collector.generateReport();
      expect(report.summary.status).toBe('error');
      if (report.summary.status === 'error') {
        expect(report.summary.error.code).toBe('TOOL_EXECUTION_ERROR');
      }
    });

    it('dovrebbe restituire status: error con QUIESCENCE_VIOLATION se uno stimolo utente viene inviato mentre non si è a riposo', async () => {
      const agentDef = defineAgent({
        identity: 'QuiescenceAgent',
        mission: 'Test quiescenza in run',
        tools: {},
        terminations: {
          done: { description: 'Done', schema: z.object({}) }
        }
      });

      const implemented = agentDef.implement({ tools: {} });
      const engine = new FrameworkEngine(createDefaultFrameworkConfig());

      const instance = implemented.spawn(engine, {
        infer: async () => ({ calls: [{ id: 't', name: 'done', payload: {} }] })
      });

      // Mettiamo forzatamente l'agente in q_exec
      instance.setControlState({ phase: 'q_exec' });

      // Ora chiamiamo run con userContent mentre l'istanza è già in q_exec
      const outcome = await instance.run({
        userContent: 'Messaggio vietato durante q_exec'
      });

      expect(outcome.status).toBe('error');
      if (outcome.status === 'error') {
        expect(outcome.error.code).toBe('QUIESCENCE_VIOLATION');
      }
    });
  });
});
