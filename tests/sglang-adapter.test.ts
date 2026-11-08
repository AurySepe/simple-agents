import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  SGLangClient,
  SGLangModelAdapter,
  SGLangQwenStrategy
} from '../src/adapters/index.js';
import { InferenceTriple, ToolDefinition } from '../src/types/index.js';

describe('SGLang Transport & Qwen Strategy', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sampleTool: ToolDefinition = {
    id: 'w_db_ordini',
    description: 'Interroga ordini cliente',
    parameters: z.object({
      cliente_id: z.number().int().positive().describe('ID cliente')
    })
  };

  const sampleTriple: InferenceTriple = {
    systemFrame: '# IDENTITÀ:\nAssistente SGLang Test',
    visibleTools: [sampleTool],
    messages: [
      {
        index: 0,
        type: 'stimulus',
        content: 'Voglio lo sconto per cliente 55'
      },
      {
        index: 1,
        type: 'thought',
        content: 'Sto per controllare il database'
      },
      {
        index: 2,
        type: 'action',
        callId: 'call_init',
        content: {
          name: 'w_db_ordini',
          payload: { cliente_id: 55 }
        }
      },
      {
        index: 3,
        type: 'result',
        callId: 'call_init',
        content: { totale: 200 }
      }
    ]
  };

  describe('SGLangClient (Transport)', () => {
    it('deve rifiutare configurazioni con baseUrl vuoto', () => {
      expect(() => new SGLangClient({ baseUrl: '' })).toThrowError(/baseUrl/);
      expect(() => new SGLangClient({ baseUrl: '   ' })).toThrowError(/baseUrl/);
    });

    it('deve normalizzare baseUrl aggiungendo /v1 se omesso', () => {
      const client = new SGLangClient({ baseUrl: 'http://localhost:30000' });
      expect(client.baseUrl).toBe('http://localhost:30000/v1');

      const clientWithV1 = new SGLangClient({ baseUrl: 'http://localhost:30000/v1/' });
      expect(clientWithV1.baseUrl).toBe('http://localhost:30000/v1');
    });

    it('deve inviare header Authorization se apiKey è specificata', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      global.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 123456789,
            model: 'test-model',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'test', arguments: '{}' }
                    }
                  ]
                },
                finish_reason: 'tool_calls'
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new SGLangClient({
        baseUrl: 'http://localhost:30000',
        apiKey: 'sk-secret-token'
      });

      await client.chatCompletions({
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        stream: false,
        temperature: 0
      });

      const authHeader =
        capturedHeaders instanceof Headers
          ? capturedHeaders.get('authorization')
          : (capturedHeaders as any)?.authorization;
      expect(authHeader).toBe('Bearer sk-secret-token');
    });

    it('deve calcolare le metriche di latenza e tokens/sec', async () => {
      global.fetch = vi.fn().mockImplementation(async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 123456789,
            model: 'QuantTrio/Qwen3.5-9B-AWQ',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  reasoning_content: 'Pensiero estratto',
                  tool_calls: [
                    {
                      id: 'c1',
                      type: 'function',
                      function: { name: 'w_db_ordini', arguments: '{"cliente_id":55}' }
                    }
                  ]
                },
                finish_reason: 'tool_calls'
              }
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const client = new SGLangClient({ baseUrl: 'http://localhost:30000' });
      const { response, metrics } = await client.chatCompletions(
        {
          model: 'QuantTrio/Qwen3.5-9B-AWQ',
          messages: [{ role: 'user', content: 'hi' }],
          stream: false,
          temperature: 0
        },
        8192
      );

      expect(response.id).toBe('chatcmpl-test');
      expect(metrics.promptTokens).toBe(100);
      expect(metrics.completionTokens).toBe(50);
      expect(metrics.totalTokens).toBe(150);
      expect(metrics.contextLimit).toBe(8192);
      expect(metrics.contextSaturationRatio).toBeCloseTo(100 / 8192);
      expect(metrics.contextTruncated).toBe(false);
    });

    it('deve lanciare errore in caso di risposta HTTP non-ok', async () => {
      global.fetch = vi.fn().mockImplementation(async () =>
        new Response('CUDA internal error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        })
      );

      const client = new SGLangClient({ baseUrl: 'http://localhost:30000' });
      await expect(
        client.chatCompletions({
          model: 'test',
          messages: [],
          stream: false,
          temperature: 0
        })
      ).rejects.toThrowError(/500/);
    });
  });

  describe('SGLangQwenStrategy', () => {
    it('deve formattare il contesto e forzare tool_choice="required" quando sono presenti tool visibili', () => {
      const strategy = new SGLangQwenStrategy();
      const formatted = strategy.formatContext(sampleTriple);

      expect(formatted.messages[0]).toEqual({
        role: 'system',
        content: '# IDENTITÀ:\nAssistente SGLang Test'
      });
      expect(formatted.messages[1]).toEqual({
        role: 'user',
        content: 'Voglio lo sconto per cliente 55'
      });
      expect(formatted.messages[2]).toEqual({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_init',
            type: 'function',
            function: {
              name: 'w_db_ordini',
              arguments: JSON.stringify({ cliente_id: 55 })
            }
          }
        ]
      });
      expect(formatted.messages[3]).toEqual({
        role: 'tool',
        tool_call_id: 'call_init',
        content: JSON.stringify({ totale: 200 })
      });

      expect(formatted.tools).toHaveLength(1);
      expect(formatted.tools?.[0].type).toBe('function');
      if (formatted.tools?.[0].type === 'function') {
        expect(formatted.tools[0].function.name).toBe('w_db_ordini');
      }
      expect(formatted.toolChoice).toBe('required');
    });

    it('deve non impostare toolChoice se non ci sono tool visibili', () => {
      const strategy = new SGLangQwenStrategy();
      const formatted = strategy.formatContext({
        systemFrame: 'System',
        visibleTools: [],
        messages: [{ index: 0, type: 'stimulus', content: 'Ciao' }]
      });

      expect(formatted.tools).toBeUndefined();
      expect(formatted.toolChoice).toBeUndefined();
    });

    it('deve estrarre reasoning_content e parsare correttamente gli argomenti JSON', () => {
      const strategy = new SGLangQwenStrategy({ reasoningFormat: 'native_field' });
      const output = strategy.parseResponse({
        id: '1',
        object: 'chat.completion',
        created: 123,
        model: 'QuantTrio/Qwen3.5-9B-AWQ',
        choices: [
          {
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: 'Preambolo conversazionale da scartare per Criticità D',
              refusal: null,
              reasoning_content: 'Devo verificare il cliente 55 nel database',
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'w_db_ordini',
                    arguments: '{"cliente_id": 55}'
                  }
                }
              ]
            } as any,
            finish_reason: 'tool_calls'
          }
        ]
      });

      if (output.status === 'stall') throw new Error('Unexpected stall');
      expect(output.thought).toBe('Devo verificare il cliente 55 nel database');
      expect(output.calls).toHaveLength(1);
      expect(output.calls[0]).toEqual({
        status: 'valid',
        id: 'call_abc',
        name: 'w_db_ordini',
        payload: { cliente_id: 55 }
      });
    });

    it('deve gestire argomenti malformati generando status="syntax_error"', () => {
      const strategy = new SGLangQwenStrategy();
      const output = strategy.parseResponse({
        id: '1',
        object: 'chat.completion',
        created: 123,
        model: 'QuantTrio/Qwen3.5-9B-AWQ',
        choices: [
          {
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: null,
              refusal: null,
              tool_calls: [
                {
                  id: 'call_broken',
                  type: 'function',
                  function: {
                    name: 'w_db_ordini',
                    arguments: '{cliente_id: invalid_json'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      });

      if (output.status === 'stall') throw new Error('Unexpected stall');
      expect(output.calls).toHaveLength(1);
      expect(output.calls[0].status).toBe('syntax_error');
      if (output.calls[0].status === 'syntax_error') {
        expect(output.calls[0].rawText).toBe('{cliente_id: invalid_json');
        expect(output.calls[0].errorDetail).toBeDefined();
      }
    });

    it('deve rilevare troncamento per saturazione token quando finish_reason="length"', () => {
      const strategy = new SGLangQwenStrategy();
      const output = strategy.parseResponse({
        id: '1',
        object: 'chat.completion',
        created: 123,
        model: 'QuantTrio/Qwen3.5-9B-AWQ',
        choices: [
          {
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: 'Risposta parzialmente generata...',
              refusal: null
            },
            finish_reason: 'length'
          }
        ]
      });

      expect(output.status).toBe('stall');
      if (output.status === 'stall') {
        expect(output.stall.reason).toBe('thinking_budget_exhausted');
        expect(output.stall.partialThought).toBe('Risposta parzialmente generata...');
        expect(output.stall.message).toContain('budget di token');
      }
    });

    it('deve supportare reasoning da tag <think> in modalità think_tags', () => {
      const strategy = new SGLangQwenStrategy({ reasoningFormat: 'think_tags' });
      const output = strategy.parseResponse({
        id: '1',
        object: 'chat.completion',
        created: 123,
        model: 'QuantTrio/Qwen3.5-9B-AWQ',
        choices: [
          {
            index: 0,
            logprobs: null,
            message: {
              role: 'assistant',
              content: '<think>Analisi interna tra tag</think>',
              refusal: null,
              tool_calls: [
                {
                  id: 'c1',
                  type: 'function',
                  function: { name: 'test_action', arguments: '{}' }
                }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ]
      });

      if (output.status === 'stall') throw new Error('Unexpected stall');
      expect(output.thought).toBe('Analisi interna tra tag');
      expect(output.calls[0].name).toBe('test_action');
    });
  });

  describe('SGLangModelAdapter (Composito)', () => {
    it('deve eseguire inferenza completa e notificare le metriche', async () => {
      global.fetch = vi.fn().mockImplementation(async () =>
        new Response(
          JSON.stringify({
            id: 'test-res',
            object: 'chat.completion',
            created: 123,
            model: 'QuantTrio/Qwen3.5-9B-AWQ',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  reasoning_content: 'Verifico ordine',
                  tool_calls: [
                    {
                      id: 'call_99',
                      type: 'function',
                      function: {
                        name: 'w_db_ordini',
                        arguments: '{"cliente_id": 55}'
                      }
                    }
                  ]
                },
                finish_reason: 'tool_calls'
              }
            ],
            usage: { prompt_tokens: 150, completion_tokens: 30, total_tokens: 180 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      let capturedMetrics: unknown;
      const client = new SGLangClient({ baseUrl: 'http://localhost:30000' });
      const strategy = new SGLangQwenStrategy();
      const adapter = new SGLangModelAdapter({
        client,
        strategy,
        model: 'QuantTrio/Qwen3.5-9B-AWQ',
        options: { temperature: 0, context_limit: 8192 },
        onMetrics: (m) => {
          capturedMetrics = m;
        }
      });

      const output = await adapter.infer(sampleTriple);

      if (output.status === 'stall') throw new Error('Unexpected stall');
      expect(output.thought).toBe('Verifico ordine');
      expect(output.calls).toHaveLength(1);
      expect(output.calls[0].name).toBe('w_db_ordini');
      expect(capturedMetrics).toBeDefined();
    });
  });
});

