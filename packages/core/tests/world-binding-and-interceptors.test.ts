import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  defineAgent,
  createRunner,
  toolOk,
  modelOk,
  type LanguageModelAdapter,
  type InferenceTriple,
  type ModelDeliberateResult
} from '../src/index.js';

interface SharedBrowserWorld {
  currentUrl: string;
  history: string[];
}

function createMockSequenceModel(
  toolCalls: Array<{ name: string; payload: Record<string, unknown> }>,
  finalPayload: Record<string, unknown>
): LanguageModelAdapter {
  let step = 0;
  return {
    async infer(_context: InferenceTriple): Promise<ModelDeliberateResult> {
      if (step < toolCalls.length) {
        const call = toolCalls[step++];
        return modelOk({
          thought: `Calling ${call.name}`,
          calls: [{ status: 'valid', id: `call_${step}`, name: call.name, payload: call.payload }]
        });
      }
      return modelOk({
        thought: 'Done',
        calls: [{ status: 'valid', id: 'call_done', name: 'finish', payload: finalPayload }]
      });
    }
  };
}

describe('Two-Phase World Binding & Pure Interceptor Pipeline', () => {
  it('consente a due agenti diversi di condividere la stessa istanza di TWorld tramite .withWorld()', async () => {
    const navigatorContract = defineAgent({
      identity: 'NavigatorAgent',
      mission: 'Navigate to URLs',
      tools: {
        goto: {
          description: 'Navigate to a URL',
          parameters: z.object({ url: z.string() }),
          returns: z.object({ ok: z.boolean() })
        }
      },
      terminations: {
        finish: {
          description: 'Finish navigation',
          schema: z.object({ finalUrl: z.string() })
        }
      }
    });

    const inspectorContract = defineAgent({
      identity: 'InspectorAgent',
      mission: 'Inspect current URL',
      tools: {
        readUrl: {
          description: 'Read current URL from shared world',
          parameters: z.object({}),
          returns: z.object({ url: z.string(), historyCount: z.number() })
        }
      },
      terminations: {
        finish: {
          description: 'Finish inspection',
          schema: z.object({ inspectedUrl: z.string() })
        }
      }
    });

    const navigatorBlueprint = navigatorContract.implement<SharedBrowserWorld>({
      tools: {
        goto: async ({ url }, world) => {
          world.currentUrl = url;
          world.history.push(url);
          return toolOk({ ok: true });
        }
      }
    });

    const inspectorBlueprint = inspectorContract.implement<SharedBrowserWorld>({
      tools: {
        readUrl: async (_args, world) => {
          return toolOk({ url: world.currentUrl, historyCount: world.history.length });
        }
      }
    });

    const sharedWorld: SharedBrowserWorld = {
      currentUrl: 'about:blank',
      history: []
    };

    const navResult = await createRunner()
      .withModel(createMockSequenceModel([{ name: 'goto', payload: { url: 'https://example.com/jobs' } }], { finalUrl: 'https://example.com/jobs' }))
      .withAgent(navigatorBlueprint)
      .withWorld(sharedWorld)
      .run({ userContent: { kind: 'text', text: 'Go to jobs' } });

    expect(navResult.ok).toBe(true);
    expect(sharedWorld.currentUrl).toBe('https://example.com/jobs');
    expect(sharedWorld.history).toEqual(['https://example.com/jobs']);

    const inspResult = await createRunner()
      .withModel(createMockSequenceModel([{ name: 'readUrl', payload: {} }], { inspectedUrl: 'https://example.com/jobs' }))
      .withAgent(inspectorBlueprint)
      .withWorld(sharedWorld)
      .run({ userContent: { kind: 'text', text: 'Inspect' } });

    expect(inspResult.ok).toBe(true);
    if (inspResult.ok && inspResult.status === 'halt') {
      expect(inspResult.result.payload).toEqual({ inspectedUrl: 'https://example.com/jobs' });
    }
  });

  it('esegue beforeToolUse e afterToolUse in pipeline propagando Ds in modo immutabile', async () => {
    const stateSchema = z.object({
      stepLog: z.array(z.string()),
      lastObservedUrl: z.string().nullable()
    });

    const agentContract = defineAgent({
      identity: 'PipelineAgent',
      mission: 'Test interceptor pipeline',
      stateSchema,
      tools: {
        visit: {
          description: 'Visit a page',
          parameters: z.object({ url: z.string() }),
          returns: z.object({ status: z.number() })
        }
      },
      terminations: {
        finish: {
          description: 'Finish pipeline test',
          schema: z.object({ done: z.boolean() })
        }
      }
    });

    const blueprint = agentContract.implement<SharedBrowserWorld>({
      initialState: {
        stepLog: [],
        lastObservedUrl: null
      },
      tools: {
        visit: async ({ url }, world) => {
          world.currentUrl = url;
          world.history.push(url);
          return toolOk({ status: 200 });
        }
      }
    });

    const sharedWorld: SharedBrowserWorld = {
      currentUrl: 'about:blank',
      history: []
    };

    const result = await createRunner()
      .withModel(createMockSequenceModel([{ name: 'visit', payload: { url: 'https://acme.dev' } }], { done: true }))
      .withAgent(blueprint)
      .withWorld(sharedWorld)
      .beforeToolUse(({ state, toolId }) => ({
        ...state.Ds,
        stepLog: [...state.Ds.stepLog, `before:${toolId}`]
      }))
      .afterToolUse(({ state, world, toolId }) => ({
        ...state.Ds,
        stepLog: [...state.Ds.stepLog, `after1:${toolId}`],
        lastObservedUrl: world.currentUrl
      }))
      .afterToolUse(({ state }) => ({
        ...state.Ds,
        stepLog: [...state.Ds.stepLog, `after2:${state.Ds.lastObservedUrl}`]
      }))
      .run({ userContent: { kind: 'text', text: 'Visit acme' } });

    expect(result.ok).toBe(true);
    expect(result.state.Ds).toEqual({
      stepLog: ['before:visit', 'after1:visit', 'after2:https://acme.dev'],
      lastObservedUrl: 'https://acme.dev'
    });
  });
});
