import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  defineAgent,
  createRunner,
  toolOk,
  toolFail,
  modelOk,
  modelFail,
  LanguageModelAdapter
} from '../src/index.js';

describe('Typed Environmental Errors, Recovery & Resume', () => {
  it('dovrebbe discriminare a compile-time e runtime gli errori infrastrutturali dichiarati dal tool con toolFail', async () => {
    type DbErrors =
      | { type: 'CONNECTION_TIMEOUT'; timeoutMs: number }
      | { type: 'POOL_EXHAUSTED' };

    let isDbOnline = false;

    const agent = defineAgent({
      identity: 'DbInspector',
      mission: 'Queries database and terminates',
      tools: {
        queryDb: {
          description: 'Esegue una query al database',
          parameters: z.object({ query: z.string() }),
          returns: z.object({ rows: z.array(z.string()) })
        }
      },
      terminations: {
        done: {
          description: 'Termina con successo',
          schema: z.object({ count: z.number() })
        }
      }
    }).implement<{ queryDb: DbErrors }>({
      tools: {
        queryDb: async (input) => {
          if (!isDbOnline) {
            return toolFail({ type: 'CONNECTION_TIMEOUT', timeoutMs: 1500 });
          }
          return toolOk({ rows: ['row1', 'row2'] });
        }
      }
    });

    const model: LanguageModelAdapter = {
      infer: vi
        .fn()
        .mockResolvedValueOnce({
          calls: [{ id: 'c1', name: 'queryDb', payload: { query: 'SELECT *' } }]
        })
        .mockResolvedValueOnce({
          calls: [{ id: 'term1', name: 'done', payload: { count: 2 } }]
        })
    };

    const runner = createRunner().withModel(model).withAgent(agent);

    // 1. Prima esecuzione: DB offline, atteso errore tipizzato
    const firstResult = await runner.run({ userContent: 'Start query' });

    expect(firstResult.ok).toBe(false);
    if (!firstResult.ok) {
      expect(firstResult.status).toBe('error');
      expect(firstResult.error.kind).toBe('TOOL_ERROR');
      if (firstResult.error.kind === 'TOOL_ERROR') {
        expect(firstResult.error.toolName).toBe('queryDb');
        expect(firstResult.error.error.type).toBe('CONNECTION_TIMEOUT');
        if (firstResult.error.error.type === 'CONNECTION_TIMEOUT') {
          expect(firstResult.error.error.timeoutMs).toBe(1500);
        }
      }

      // Verifichiamo che lo stato rimanga integro e non inquinato
      expect(firstResult.state.Ta.has('queryDb')).toBe(true);

      // 2. Risanamento della condizione esterna del mondo W
      isDbOnline = true;

      // 3. Ripresa dell'esecuzione tramite firstResult.resume()
      const resumedResult = await firstResult.resume();
      expect(resumedResult.ok).toBe(true);
      if (resumedResult.ok) {
        expect(resumedResult.status).toBe('halt');
        if (resumedResult.status === 'halt') {
          expect(resumedResult.result.type).toBe('done');
          expect(resumedResult.result.payload).toEqual({ count: 2 });
        }
      }
    }
  });

  it('dovrebbe catturare eccezioni impreviste (throw) nel tool e trasformarle in UNEXPECTED_ERROR', async () => {
    const agent = defineAgent({
      identity: 'BuggyAgent',
      mission: 'Calls a buggy tool',
      tools: {
        crash: {
          description: 'Lancia un throw inatteso',
          parameters: z.object({}),
          returns: z.string()
        }
      },
      terminations: {
        done: {
          description: 'Termina',
          schema: z.object({})
        }
      }
    }).implement({
      tools: {
        crash: async () => {
          throw new Error('Kernel crash / unhandled failure');
        }
      }
    });

    const model: LanguageModelAdapter = {
      infer: async () => ({
        calls: [{ id: 'c1', name: 'crash', payload: {} }]
      })
    };

    const runner = createRunner().withModel(model).withAgent(agent);
    const result = await runner.run({ userContent: 'Go' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('error');
      expect(result.error.kind).toBe('TOOL_ERROR');
      if (result.error.kind === 'TOOL_ERROR') {
        expect(result.error.toolName).toBe('crash');
        expect(result.error.error.type).toBe('UNEXPECTED_ERROR');
        if (result.error.error.type === 'UNEXPECTED_ERROR') {
          expect(result.error.error.message).toContain('Kernel crash / unhandled failure');
        }
      }
    }
  });

  it('dovrebbe supportare la policy dichiarativa withRecovery con retry e abort per i tool', async () => {
    type NetworkErrors = { type: 'SOCKET_HANGUP' };
    let attempts = 0;

    const agent = defineAgent({
      identity: 'NetworkAgent',
      mission: 'Fetches network',
      tools: {
        fetchData: {
          description: 'Chiamata di rete',
          parameters: z.object({}),
          returns: z.string()
        }
      },
      terminations: {
        done: {
          description: 'Fatto',
          schema: z.string()
        }
      }
    }).implement<{ fetchData: NetworkErrors }>({
      tools: {
        fetchData: async () => {
          attempts++;
          if (attempts < 3) {
            return toolFail({ type: 'SOCKET_HANGUP' });
          }
          return toolOk('online_payload');
        }
      }
    });

    const model: LanguageModelAdapter = {
      infer: vi
        .fn()
        .mockResolvedValueOnce({
          calls: [{ id: 'c1', name: 'fetchData', payload: {} }]
        })
        .mockResolvedValueOnce({
          calls: [{ id: 'term', name: 'done', payload: 'finished' }]
        })
    };

    // Runner configurato con policy dichiarativa: riprova se attempt <= 3
    const runner = createRunner()
      .withModel(model)
      .withAgent(agent)
      .withRecovery({
        onToolError: {
          fetchData: async (error, context) => {
            if (error.type === 'SOCKET_HANGUP' && context.attempt < 4) {
              return { action: 'retry' };
            }
            return { action: 'abort' };
          }
        }
      });

    const result = await runner.run({ userContent: 'Start' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe('halt');
      expect(attempts).toBe(3);
    }
  });

  it('dovrebbe propagare e recuperare errori infrastrutturali del modello linguistico (ModelExecutionError)', async () => {
    type ModelCustomErrors =
      | { type: 'RATE_LIMIT_EXCEEDED'; retryAfterMs: number }
      | { type: 'QUOTA_EXHAUSTED' };

    let modelCalls = 0;

    const customModel: LanguageModelAdapter<ModelCustomErrors> = {
      infer: async () => {
        modelCalls++;
        if (modelCalls === 1) {
          return modelFail({ type: 'RATE_LIMIT_EXCEEDED', retryAfterMs: 50 });
        }
        return modelOk({
          calls: [{ id: 'term', name: 'done', payload: { success: true } }]
        });
      }
    };

    const agent = defineAgent({
      identity: 'ModelTester',
      mission: 'Test model recovery',
      tools: {},
      terminations: {
        done: {
          description: 'Done',
          schema: z.object({ success: z.boolean() })
        }
      }
    }).implement({
      tools: {}
    });

    // 1. Senza recovery policy: errore immediato
    const runner = createRunner().withModel(customModel).withAgent(agent);
    const failResult = await runner.run({ userContent: 'Hello' });

    expect(failResult.ok).toBe(false);
    if (!failResult.ok) {
      expect(failResult.error.kind).toBe('MODEL_ERROR');
      if (failResult.error.kind === 'MODEL_ERROR') {
        expect(failResult.error.error.type).toBe('RATE_LIMIT_EXCEEDED');
      }

      // 2. Ripresa interattiva con .resume()
      const resumedResult = await failResult.resume();
      expect(resumedResult.ok).toBe(true);
      if (resumedResult.ok) {
        expect(resumedResult.status).toBe('halt');
      }
    }
  });
});
