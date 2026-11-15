import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  OllamaClient,
  OllamaModelAdapter,
  QwenModelStrategy
} from '../src/index.js';
import { InferenceTriple, ToolDefinition } from '@simple-agents/core';

describe('Ollama Transport & Qwen Strategy', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sampleTool: ToolDefinition = {
    id: 'w_db_ordini',
    kind: 'world',
    description: 'Interroga ordini cliente',
    parameters: z.object({
      cliente_id: z.number().int().positive().describe('ID cliente')
    })
  };

  const sampleTriple: InferenceTriple = {
    systemFrame: '# IDENTITÀ:\nAssistente Test',
    visibleTools: [sampleTool],
    messages: [
      {
        index: 0,
        type: 'stimulus',
        content: { kind: 'text', text: 'Voglio lo sconto per cliente 55' }
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

  describe('OllamaClient (Transport)', () => {
    it('deve rifiutare configurazioni con baseUrl vuoto', () => {
      expect(() => new OllamaClient({ baseUrl: '' })).toThrowError(/baseUrl/);
      expect(() => new OllamaClient({ baseUrl: '   ' })).toThrowError(/baseUrl/);
    });

    it('deve eseguire la POST verso /api/chat e calcolare le metriche corrette', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          model: 'qwen3.5:9b',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: '',
            thinking: 'Pensiero',
            tool_calls: [
              {
                id: 'call_1',
                function: { name: 'w_db_ordini', arguments: { cliente_id: 55 } }
              }
            ]
          },
          done: true,
          total_duration: 100_000_000,
          eval_count: 40,
          eval_duration: 50_000_000
        })
      }));

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const { response, metrics } = await client.chat({
        model: 'qwen3.5:9b',
        stream: false,
        options: { temperature: 0 },
        messages: [{ role: 'user', content: 'test' }]
      });

      expect(response.model).toBe('qwen3.5:9b');
      expect(metrics.evalCount).toBe(40);
      expect(metrics.evalDurationMs).toBe(50);
      expect(metrics.tokensPerSecond).toBe(800); // 40 / 0.050s = 800 tok/s
    });

    it('deve sollevare errore descrittivo se Ollama risponde con errore HTTP', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal GPU OOM Error'
      }));

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      await expect(
        client.chat({
          model: 'qwen3.5:9b',
          stream: false,
          options: { temperature: 0 },
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrowError(/Ollama HTTP error 500/);
    });

    it('deve interrompere la richiesta e sollevare errore se viene superato il timeoutMs configurato', async () => {
      global.fetch = vi.fn().mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const abortErr = new Error('The operation was aborted');
              abortErr.name = 'TimeoutError';
              reject(abortErr);
            });
          }
        });
      });

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434', timeoutMs: 50 });
      await expect(
        client.chat({
          model: 'qwen3.5:9b',
          stream: false,
          options: { temperature: 0 },
          messages: [{ role: 'user', content: 'test' }]
        })
      ).rejects.toThrowError(/timed out \(50ms\)/);
    });
  });

  describe('QwenModelStrategy', () => {
    const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });

    it('deve richiedere obbligatoriamente reasoningFormat nella configurazione senza default arbitrari', () => {
      expect(() => new QwenModelStrategy(undefined as unknown as { reasoningFormat: any })).toThrowError(/reasoningFormat/);
      expect(() => new QwenModelStrategy({} as unknown as { reasoningFormat: any })).toThrowError(/reasoningFormat/);
    });

    it('deve formattare il contesto rispettando la mappatura pura', () => {
      const { messages, tools } = strategy.formatContext(sampleTriple);

      // 1. Frame F_Ω senza manipolazioni arbitrarie
      expect(messages[0]).toEqual({
        role: 'system',
        content: '# IDENTITÀ:\nAssistente Test'
      });

      // 2. User payload
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'Voglio lo sconto per cliente 55'
      });

      // 3. Agent thought + call raggruppati in un unico messaggio assistant (con thinking effimero di default)
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_init',
            type: 'function',
            function: {
              name: 'w_db_ordini',
              arguments: { cliente_id: 55 }
            }
          }
        ]
      });

      // 4. World result -> tool con tool_call_id corrispondente
      expect(messages[3]).toEqual({
        role: 'tool',
        tool_call_id: 'call_init',
        content: JSON.stringify({ totale: 200 })
      });

      // 5. Tools formattati con JSON schema
      expect(tools).toHaveLength(1);
      expect(tools![0].function.name).toBe('w_db_ordini');
      expect(tools![0].function.parameters.type).toBe('object');
    });

    it('deve includere il thinking pregresso quando includeHistoricalThinking è true', () => {
      const strategy = new QwenModelStrategy({
        reasoningFormat: 'native_field',
        includeHistoricalThinking: true
      });
      const { messages } = strategy.formatContext(sampleTriple);
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: 'Sto per controllare il database',
        tool_calls: [
          {
            id: 'call_init',
            type: 'function',
            function: {
              name: 'w_db_ordini',
              arguments: { cliente_id: 55 }
            }
          }
        ]
      });
    });

    it('deve mappare gli errori diagnostici direttamente come messaggi role: tool con tool_call_id e il messaggio di errore', () => {
      const errorTriple: InferenceTriple = {
        systemFrame: 'System Frame Iniziale',
        visibleTools: [sampleTool],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Esegui operazione con parametro' }
          },
          {
            index: 1,
            type: 'thought',
            content: 'Provo a chiamare il tool'
          },
          {
            index: 2,
            type: 'action',
            callId: 'call_err_42',
            content: {
              name: 'w_db_ordini',
              payload: { cliente_id: -99 }
            }
          },
          {
            index: 3,
            type: 'result',
            callId: 'call_err_42',
            content: {
              status: 'error',
              code: 'SCHEMA_VALIDATION_ERROR',
              message: 'ID cliente deve essere positivo'
            }
          }
        ]
      };

      const { messages } = strategy.formatContext(errorTriple);

      expect(messages[0]).toEqual({
        role: 'system',
        content: 'System Frame Iniziale'
      });
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'Esegui operazione con parametro'
      });
      expect(messages[2]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_err_42',
            type: 'function',
            function: {
              name: 'w_db_ordini',
              arguments: { cliente_id: -99 }
            }
          }
        ]
      });
      expect(messages[3]).toEqual({
        role: 'tool',
        tool_call_id: 'call_err_42',
        content: JSON.stringify({
          status: 'error',
          code: 'SCHEMA_VALIDATION_ERROR',
          message: 'ID cliente deve essere positivo'
        })
      });
    });

    it('deve parsare thinking nativo e tool_calls garantendo NonEmptyArray', () => {
      const parsed = strategy.parseResponse({
        model: 'qwen3.5:9b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: '',
          thinking: 'Il cliente 55 richiede verifica del preventivo.',
          tool_calls: [
            {
              id: 'call_99',
              function: {
                name: 'w_db_ordini',
                arguments: { cliente_id: 55 }
              }
            }
          ]
        },
        done: true
      });

      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.thought).toBe('Il cliente 55 richiede verifica del preventivo.');
      expect(parsed.calls).toHaveLength(1);
      expect(parsed.calls[0]).toEqual({
        status: 'valid',
        id: 'call_99',
        name: 'w_db_ordini',
        payload: { cliente_id: 55 }
      });
    });

    it('deve identificare esplicitamente un syntax_error quando arguments è un JSON malformato (Criticità E)', () => {
      const parsed = strategy.parseResponse({
        model: 'qwen3.5:9b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: '',
          thinking: 'Sto chiamando il tool con JSON corrotto.',
          tool_calls: [
            {
              id: 'call_broken',
              function: {
                name: 'w_db_ordini',
                arguments: '{"cliente_id": 55' // Manca la graffa di chiusura!
              }
            }
          ]
        },
        done: true
      });

      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.calls).toHaveLength(1);
      expect(parsed.calls[0].status).toBe('syntax_error');
      if (parsed.calls[0].status === 'syntax_error') {
        expect(parsed.calls[0].rawText).toBe('{"cliente_id": 55');
        expect(parsed.calls[0].errorDetail).toBeDefined();
        expect(parsed.calls[0].payload).toEqual({ raw: '{"cliente_id": 55' });
      }
    });

    it('deve estrarre il pensiero dai tag <think>...</think> quando reasoningFormat è think_tags', () => {
      const tagStrategy = new QwenModelStrategy({ reasoningFormat: 'think_tags' });
      const parsed = tagStrategy.parseResponse({
        model: 'qwen2.5:7b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: '<think>Analisi interna del problema cliente.</think>',
          tool_calls: [
            {
              id: 'call_101',
              function: { name: 'w_db_ordini', arguments: { cliente_id: 12 } }
            }
          ]
        },
        done: true
      });

      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.thought).toBe('Analisi interna del problema cliente.');
      expect(parsed.calls).toHaveLength(1);
    });

    it('deve estrarre il pensiero anche con tag <think> non chiuso in caso di troncamento', () => {
      const tagStrategy = new QwenModelStrategy({ reasoningFormat: 'think_tags' });
      const parsed = tagStrategy.parseResponse({
        model: 'qwen2.5:7b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: '<think>Analisi troncata bruscamente per limite token',
          tool_calls: [
            {
              id: 'call_102',
              function: { name: 'w_db_ordini', arguments: { cliente_id: 12 } }
            }
          ]
        },
        done: true
      });

      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.thought).toBe('Analisi troncata bruscamente per limite token');
    });

    it('non deve estrarre alcun pensiero quando reasoningFormat è none', () => {
      const noneStrategy = new QwenModelStrategy({ reasoningFormat: 'none' });
      const parsed = noneStrategy.parseResponse({
        model: 'qwen2.5:7b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: '<think>Questo testo deve essere ignorato.</think>',
          thinking: 'Anche questo va ignorato.',
          tool_calls: [
            {
              id: 'call_103',
              function: { name: 'w_db_ordini', arguments: { cliente_id: 12 } }
            }
          ]
        },
        done: true
      });

      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.thought).toBeUndefined();
      expect(parsed.calls).toHaveLength(1);
    });

    it('deve scartare il preambolo conversazionale in content in presenza di tool_calls e thinking nativo (Criticità D)', () => {
      const nativeStrategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });
      const parsed = nativeStrategy.parseResponse({
        model: 'qwen3.5:9b',
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          thinking: 'Sto verificando gli ordini per il cliente 42 nel database.',
          content: 'Certamente! Procedo subito a controllare il database degli ordini.',
          tool_calls: [
            {
              id: 'call_104',
              function: { name: 'w_db_ordini', arguments: { cliente_id: 42 } }
            }
          ]
        },
        done: true
      });

      // Il pensiero epistemico deve provenire unicamente da thinking
      if (parsed.status === 'stall') throw new Error('Unexpected stall');
      expect(parsed.thought).toBe('Sto verificando gli ordini per il cliente 42 nel database.');
      expect(parsed.calls).toHaveLength(1);
      expect(parsed.calls[0].name).toBe('w_db_ordini');
      expect(parsed.calls[0].payload).toEqual({ cliente_id: 42 });
    });

    it('deve lanciare un errore chiaro se il modello viola il vincolo di emettere almeno una call', () => {
      expect(() =>
        strategy.parseResponse({
          model: 'qwen3.5:9b',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: 'Rispondo a testo libero senza chiamare nessun tool.',
            tool_calls: []
          },
          done: true
        })
      ).toThrowError(/selected no action/);
    });
  });

  describe('OllamaModelAdapter (Composito)', () => {
    it('deve richiedere parametri espliciti senza accettare default nascosti', () => {
      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });

      expect(
        () =>
          new OllamaModelAdapter({
            client,
            strategy,
            model: '',
            options: { temperature: 0 }
          })
      ).toThrowError(/model/);

      expect(
        () =>
          new OllamaModelAdapter({
            client,
            strategy,
            model: 'qwen3.5:9b',
            options: { temperature: undefined as unknown as number }
          })
      ).toThrowError(/temperature/);
    });

    it('deve coordinare client e strategia producendo ModelOutput valido', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          model: 'qwen3.5:9b',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: '',
            thinking: 'Eseguo la chiamata',
            tool_calls: [
              {
                id: 'call_x',
                function: {
                  name: 'w_db_ordini',
                  arguments: { cliente_id: 55 }
                }
              }
            ]
          },
          done: true
        })
      }));

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });
      const adapter = new OllamaModelAdapter({
        client,
        strategy,
        model: 'qwen3.5:9b',
        options: { temperature: 0 }
      });

      const output = await adapter.infer(sampleTriple);
      if (output.status === 'stall') throw new Error('Unexpected stall');
      expect(output.thought).toBe('Eseguo la chiamata');
      expect(output.calls[0].name).toBe('w_db_ordini');
    });

    it('deve calcolare le metriche di saturazione del contesto e attivare onContextTruncation quando prompt_eval_count >= num_ctx', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          model: 'qwen3.5:9b',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: '',
            thinking: 'Pensiero',
            tool_calls: [
              {
                id: 'call_trunc',
                function: { name: 'w_db_ordini', arguments: { cliente_id: 10 } }
              }
            ]
          },
          done: true,
          prompt_eval_count: 4096, // Eguaglia num_ctx => Troncamento avvenuto
          eval_count: 20
        })
      }));

      let capturedWarning: any;
      let capturedMetrics: any;

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });
      const adapter = new OllamaModelAdapter({
        client,
        strategy,
        model: 'qwen3.5:9b',
        options: { temperature: 0, num_ctx: 4096 },
        onMetrics: (m) => {
          capturedMetrics = m;
        },
        onContextTruncation: (w) => {
          capturedWarning = w;
        }
      });

      await adapter.infer(sampleTriple);

      expect(capturedMetrics.numCtx).toBe(4096);
      expect(capturedMetrics.contextTruncated).toBe(true);
      expect(capturedMetrics.contextSaturationRatio).toBe(1.0);

      expect(capturedWarning).toBeDefined();
      expect(capturedWarning.promptEvalCount).toBe(4096);
      expect(capturedWarning.numCtx).toBe(4096);
      expect(capturedWarning.saturationRatio).toBe(1.0);
    });

    it('non deve attivare onContextTruncation se prompt_eval_count è inferiore a num_ctx', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          model: 'qwen3.5:9b',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: '',
            thinking: 'Pensiero',
            tool_calls: [
              {
                id: 'call_ok',
                function: { name: 'w_db_ordini', arguments: { cliente_id: 10 } }
              }
            ]
          },
          done: true,
          prompt_eval_count: 1024,
          eval_count: 20
        })
      }));

      const onContextTruncation = vi.fn();
      let capturedMetrics: any;

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });
      const adapter = new OllamaModelAdapter({
        client,
        strategy,
        model: 'qwen3.5:9b',
        options: { temperature: 0, num_ctx: 4096 },
        onMetrics: (m) => {
          capturedMetrics = m;
        },
        onContextTruncation
      });

      await adapter.infer(sampleTriple);

      expect(capturedMetrics.contextTruncated).toBe(false);
      expect(capturedMetrics.contextSaturationRatio).toBe(0.25);
      expect(onContextTruncation).not.toHaveBeenCalled();
    });

    it('deve formattare correttamente il contesto per chiamate parallele preservando ordinamento e tool_call_id', () => {
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });

      const parallelTriple: InferenceTriple = {
        systemFrame: '# SYSTEM',
        visibleTools: [sampleTool],
        messages: [
          { index: 0, type: 'stimulus', content: { kind: 'text', text: 'Cerca per clienti 10 e 20' } },
          { index: 1, type: 'thought', content: 'Controllo entrambi in parallelo' },
          { index: 2, type: 'action', callId: 'call_p1', content: { name: 'w_db_ordini', payload: { cliente_id: 10 } } },
          { index: 3, type: 'action', callId: 'call_p2', content: { name: 'w_db_ordini', payload: { cliente_id: 20 } } },
          { index: 4, type: 'result', callId: 'call_p1', content: { totale: 100 } },
          { index: 5, type: 'result', callId: 'call_p2', content: { totale: 200 } }
        ]
      };

      const formatted = strategy.formatContext(parallelTriple);

      // Deve aggregare le due chiamate in un singolo messaggio assistant con 2 tool_calls
      const assistantMsg = formatted.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.tool_calls).toHaveLength(2);
      expect(assistantMsg?.tool_calls?.[0].id).toBe('call_p1');
      expect(assistantMsg?.tool_calls?.[1].id).toBe('call_p2');

      // Devono seguire due messaggi 'tool' con i rispettivi tool_call_id nel medesimo ordine
      const toolMessages = formatted.messages.filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(2);
      expect(toolMessages[0].tool_call_id).toBe('call_p1');
      expect(toolMessages[0].content).toBe(JSON.stringify({ totale: 100 }));
      expect(toolMessages[1].tool_call_id).toBe('call_p2');
      expect(toolMessages[1].content).toBe(JSON.stringify({ totale: 200 }));
    });

    it('deve popolare il campo usage in ModelResult con le metriche dei token estratti da Ollama', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'qwen3.5:9b',
          created_at: '2026-11-06T12:00:00Z',
          message: {
            role: 'assistant',
            content: 'Risposta',
            tool_calls: [
              {
                id: 'call_1',
                function: { name: 'w_db_ordini', arguments: { cliente_id: 55 } }
              }
            ]
          },
          done: true,
          prompt_eval_count: 120,
          eval_count: 45,
          total_duration: 1_000_000_000,
          prompt_eval_duration: 600_000_000,
          eval_duration: 400_000_000
        })
      });

      const client = new OllamaClient({ baseUrl: 'http://localhost:11434' });
      const strategy = new QwenModelStrategy({ reasoningFormat: 'native_field' });
      const adapter = new OllamaModelAdapter({
        client,
        strategy,
        model: 'qwen3.5:9b',
        options: { temperature: 0 }
      });

      const result = await adapter.infer(sampleTriple);
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(120);
      expect(result.usage?.completionTokens).toBe(45);
      expect(result.usage?.totalTokens).toBe(165);
      expect(result.usage?.tokensPerSecond).toBeGreaterThan(0);
    });
  });
});

