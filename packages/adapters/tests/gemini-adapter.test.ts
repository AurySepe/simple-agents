import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  GeminiModelAdapter,
  GeminiStrategy,
  cleanZodSchemaForGemini,
  createGeminiAdapter,
  parseGeminiError
} from '../src/index.js';
import type {
  InferenceTriple,
  ToolDefinition,
  UserMessageContent
} from '@formal-agent/core';
import { FinishReason, FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';

describe('Gemini Adapter Suite (Gemini 3 & 4 - Zero Implicit Defaults)', () => {
  const sampleTool: ToolDefinition = {
    id: 'cerca_documenti',
    description: 'Cerca tra i documenti aziendali',
    parameters: z.object({
      query: z.string().describe('Chiave di ricerca'),
      limite: z.number().int().optional().describe('Numero massimo di risultati')
    })
  };

  const sampleTriple: InferenceTriple = {
    systemFrame: 'Sei un assistente per la ricerca documentale.',
    visibleTools: [sampleTool],
    messages: [
      {
        index: 0,
        type: 'stimulus',
        content: { kind: 'text', text: 'Trova il bilancio 2025' }
      },
      {
        index: 1,
        type: 'thought',
        content: 'Devo interrogare il tool cerca_documenti con la query specificata'
      },
      {
        index: 2,
        type: 'action',
        callId: 'call_123',
        content: {
          name: 'cerca_documenti',
          payload: { query: 'bilancio 2025', limite: 5 }
        }
      },
      {
        index: 3,
        type: 'result',
        callId: 'call_123',
        content: { trovati: 1, docId: 'doc_bilancio_2025' }
      }
    ]
  };

  describe('cleanZodSchemaForGemini & GeminiStrategy (Nessun default implicito)', () => {
    it('rimuove $schema dalla serializzazione zod per compatibilità OpenAPI Gemini', () => {
      const schema = z.object({
        testo: z.string()
      });
      const cleaned = cleanZodSchemaForGemini(schema);
      expect(cleaned).not.toHaveProperty('$schema');
      expect(cleaned).toHaveProperty('type', 'object');
      expect(cleaned).toHaveProperty('properties');
    });

    it('forza sempre mode: ANY in toolConfig quando ci sono strumenti visibili per garantire la deliberazione', () => {
      const strategy = new GeminiStrategy();
      const formatted = strategy.format(sampleTriple);

      expect(formatted.tools).toBeDefined();
      expect(formatted.tools?.[0].functionDeclarations).toHaveLength(1);
      expect(formatted.toolConfig?.functionCallingConfig?.mode).toBe(FunctionCallingConfigMode.ANY);
      expect(formatted.toolConfig?.functionCallingConfig?.allowedFunctionNames).toEqual(['cerca_documenti']);
    });

    it('non crea toolConfig se non sono presenti strumenti visibili', () => {
      const strategy = new GeminiStrategy();
      const tripleWithoutTools: InferenceTriple = {
        ...sampleTriple,
        visibleTools: []
      };
      const formatted = strategy.format(tripleWithoutTools);
      expect(formatted.tools).toBeUndefined();
      expect(formatted.toolConfig).toBeUndefined();
    });

    it('NON aggiunge default a thinkingConfig se non esplicitamente richiesto', () => {
      const strategy = new GeminiStrategy();
      const formatted = strategy.format(sampleTriple);
      expect(formatted.thinkingConfig).toBeUndefined();

      const strategyExplicit = new GeminiStrategy({
        thinking: {
          thinkingLevel: ThinkingLevel.HIGH
        }
      });
      const formattedExplicit = strategyExplicit.format(sampleTriple);
      expect(formattedExplicit.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.HIGH);
      // Nessun default forzato su includeThoughts o budget
      expect(formattedExplicit.thinkingConfig?.includeThoughts).toBeUndefined();
      expect(formattedExplicit.thinkingConfig?.thinkingBudget).toBeUndefined();
    });

    it('supporta stimoli multimodali (immagini base64, audio, file di testo)', () => {
      const strategy = new GeminiStrategy();

      const multimodalContent: UserMessageContent = {
        kind: 'text_with_media',
        text: 'Descrivi questa scansione',
        files: [
          {
            modality: 'image',
            source: {
              kind: 'inline',
              mimeType: 'image/png',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
            }
          },
          {
            modality: 'text_file',
            filename: 'dati.csv',
            source: {
              kind: 'inline',
              mimeType: 'text/csv',
              data: 'id,nome\n1,Mario'
            }
          }
        ]
      };

      const triple: InferenceTriple = {
        systemFrame: 'System test',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: multimodalContent
          }
        ]
      };

      const formatted = strategy.format(triple);
      const userParts = formatted.contents[0].parts;

      expect(userParts[0]).toEqual({ text: 'Descrivi questa scansione' });
      expect(userParts[1]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        }
      });
      expect(userParts[2]).toHaveProperty('text');
      expect((userParts[2] as { text: string }).text).toContain('[File: dati.csv]');
      expect((userParts[2] as { text: string }).text).toContain('id,nome\n1,Mario');
    });

    it('proietta azioni native con providerMetadata.thoughtSignature come functionCall nativo in modo stateless', () => {
      const strategy = new GeminiStrategy();
      const tripleWithGeminiSig: InferenceTriple = {
        systemFrame: 'System test',
        visibleTools: [sampleTool],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Cerca file' }
          },
          {
            index: 1,
            type: 'action',
            callId: 'call_gemini_1',
            content: { name: 'cerca_documenti', payload: { query: 'report' } },
            providerMetadata: { provider: 'gemini', thoughtSignature: 'sig_crypto_test_123' }
          },
          {
            index: 2,
            type: 'result',
            callId: 'call_gemini_1',
            content: { trovati: 1 }
          }
        ]
      };

      const formatted = strategy.format(tripleWithGeminiSig);

      // Il messaggio del modello contiene la functionCall con la thoughtSignature intatta
      const modelContent = formatted.contents.find((c) => c.role === 'model');
      expect(modelContent).toBeDefined();
      expect(modelContent?.parts[0]).toEqual({
        functionCall: {
          name: 'cerca_documenti',
          args: { query: 'report' },
          id: 'call_gemini_1'
        },
        thoughtSignature: 'sig_crypto_test_123'
      });

      // Il messaggio successivo contiene la functionResponse nativa
      const responseContent = formatted.contents[formatted.contents.length - 1];
      expect(responseContent.role).toBe('user');
      expect(responseContent.parts[0]).toEqual({
        functionResponse: {
          name: 'cerca_documenti',
          response: {
            output: { trovati: 1 }
          }
        }
      });
    });

    it('proietta azioni prive di firma (cross-model da Qwen/Claude) come messaggi user naturali per prevenire errori 400', () => {
      const strategy = new GeminiStrategy();
      const tripleCrossModel: InferenceTriple = {
        systemFrame: 'System test',
        visibleTools: [sampleTool],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Cerca file' }
          },
          {
            index: 1,
            type: 'action',
            callId: 'call_qwen_1',
            content: { name: 'cerca_documenti', payload: { query: 'vecchio report' } }
            // Nessun providerMetadata: generato da un altro modello o deserializzato
          },
          {
            index: 2,
            type: 'result',
            callId: 'call_qwen_1',
            content: { trovati: 0 }
          }
        ]
      };

      const formatted = strategy.format(tripleCrossModel);

      // Nessun functionCall sprovvisto di firma viene inviato con role: 'model'
      const modelContent = formatted.contents.find((c) => c.role === 'model');
      expect(modelContent).toBeUndefined();

      // Entrambi gli eventi sono proiettati come testo utente contestuale pulito
      const userContent = formatted.contents.find((c) => c.role === 'user');
      expect(userContent).toBeDefined();
      const fullUserText = userContent?.parts.map((p: any) => p.text).join('\n');
      expect(fullUserText).toContain('[Previously executed action]: cerca_documenti');
      expect(fullUserText).toContain('[Observed result for cerca_documenti]: {"trovati":0}');
    });
  });

  describe('parseGeminiError', () => {
    it('gestisce timeout di rete (AbortError) senza inventare default se timeoutMs è omesso', () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      const parsedWithMs = parseGeminiError(abortErr, 5000);
      expect(parsedWithMs.type).toBe('NETWORK_TIMEOUT');
      if (parsedWithMs.type === 'NETWORK_TIMEOUT') {
        expect(parsedWithMs.timeoutMs).toBe(5000);
        expect(parsedWithMs.message).toContain('5000ms');
      }

      const parsedWithoutMs = parseGeminiError(abortErr);
      expect(parsedWithoutMs.type).toBe('NETWORK_TIMEOUT');
      if (parsedWithoutMs.type === 'NETWORK_TIMEOUT') {
        expect(parsedWithoutMs.timeoutMs).toBeUndefined();
      }
    });

    it('gestisce 429 / RESOURCE_EXHAUSTED con parsing retryAfter', () => {
      const rateErr = {
        status: 429,
        message: 'Resource exhausted: quota exceeded. retry after 15 seconds'
      };

      const parsed = parseGeminiError(rateErr);
      expect(parsed.type).toBe('RATE_LIMIT_EXCEEDED');
      if (parsed.type === 'RATE_LIMIT_EXCEEDED') {
        expect(parsed.status).toBe(429);
        expect(parsed.retryAfterMs).toBe(15000);
      }
    });

    it('gestisce 401 / 403 API_KEY_INVALID', () => {
      const authErr = {
        status: 401,
        message: 'API_KEY_INVALID: The provided API key is invalid'
      };

      const parsed = parseGeminiError(authErr);
      expect(parsed.type).toBe('INVALID_API_KEY');
      if (parsed.type === 'INVALID_API_KEY') {
        expect(parsed.status).toBe(401);
      }
    });

    it('gestisce 503 SERVICE_UNAVAILABLE', () => {
      const servErr = {
        status: 503,
        message: 'The model is currently overloaded. UNAVAILABLE'
      };

      const parsed = parseGeminiError(servErr);
      expect(parsed.type).toBe('SERVICE_UNAVAILABLE');
      if (parsed.type === 'SERVICE_UNAVAILABLE') {
        expect(parsed.status).toBe(503);
      }
    });

    it('gestisce superamento finestra di contesto', () => {
      const ctxErr = {
        message: 'Request payload size exceeds the maximum context length allowed'
      };

      const parsed = parseGeminiError(ctxErr);
      expect(parsed.type).toBe('CONTEXT_WINDOW_EXCEEDED');
    });

    it('gestisce errori generici di rete come NETWORK_ERROR', () => {
      const netErr = new TypeError('fetch failed: ECONNRESET');

      const parsed = parseGeminiError(netErr);
      expect(parsed.type).toBe('NETWORK_ERROR');
      if (parsed.type === 'NETWORK_ERROR') {
        expect(parsed.cause).toBe(netErr);
      }
    });
  });

  describe('GeminiModelAdapter (Rigorosa configurazione esplicita)', () => {
    it('lancia errore esplicito se apiKey o model sono omessi', () => {
      expect(() => new GeminiModelAdapter(undefined as any)).toThrow('GeminiAdapterConfig must be provided explicitly');
      expect(() => new GeminiModelAdapter({ apiKey: '', model: 'gemini-3.5-pro' })).toThrow('Gemini API key must be explicitly provided');
      expect(() => new GeminiModelAdapter({ apiKey: 'fake-key', model: '' })).toThrow('Gemini model name must be explicitly provided');
    });

    it('inferisce invocazioni di tool con successo ritornando modelOk', async () => {
      const adapter = createGeminiAdapter({
        apiKey: 'fake-test-key',
        model: 'gemini-3.5-pro'
      });

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            finishReason: FinishReason.STOP,
            content: {
              parts: [
                { thought: true, text: 'Rifletto sul documento da ricercare...' },
                {
                  functionCall: {
                    name: 'cerca_documenti',
                    args: { query: 'bilancio 2025', limite: 1 }
                  }
                }
              ]
            }
          }
        ],
        functionCalls: [
          {
            name: 'cerca_documenti',
            args: { query: 'bilancio 2025', limite: 1 }
          }
        ],
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 45,
          totalTokenCount: 165
        }
      });

      (adapter as any).client = {
        models: {
          generateContent: mockGenerateContent
        }
      };

      const result = await adapter.infer(sampleTriple);

      expect(result.ok).toBe(true);
      if (result.ok && !('status' in result.data && result.data.status === 'stall')) {
        expect(result.data.thought).toBe('Rifletto sul documento da ricercare...');
        expect(result.data.calls).toHaveLength(1);
        expect(result.data.calls[0].name).toBe('cerca_documenti');
        expect(result.data.calls[0].payload).toEqual({ query: 'bilancio 2025', limite: 1 });
        expect(result.data.usage?.promptTokens).toBe(120);
        expect(result.data.usage?.completionTokens).toBe(45);
      }
    });

    it('ritorna uno stall formale quando il modello esaurisce il budget di token (finishReason = MAX_TOKENS)', async () => {
      const adapter = createGeminiAdapter({
        apiKey: 'fake-key',
        model: 'gemini-3.5-flash'
      });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.MAX_TOKENS,
                content: {
                  parts: [{ thought: true, text: 'Stavo elaborando la query...' }]
                }
              }
            ],
            functionCalls: undefined,
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 8192,
              totalTokenCount: 8292
            }
          })
        }
      };

      const result = await adapter.infer(sampleTriple);

      expect(result.ok).toBe(true);
      if (result.ok && 'status' in result.data && result.data.status === 'stall') {
        expect(result.data.stall.reason).toBe('thinking_budget_exhausted');
        expect(result.data.stall.partialThought).toBe('Stavo elaborando la query...');
      } else {
        expect.unreachable('Atteso risultato di tipo stall');
      }
    });

    it('intercetta SAFETY_BLOCKED e ritorna modelFail tipizzato', async () => {
      const adapter = createGeminiAdapter({
        apiKey: 'fake-key',
        model: 'gemini-3.5-pro'
      });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.SAFETY,
                safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' }]
              }
            ]
          })
        }
      };

      const result = await adapter.infer(sampleTriple);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('SAFETY_BLOCKED');
        if (result.error.type === 'SAFETY_BLOCKED') {
          expect(result.error.finishReason).toBe('SAFETY');
        }
      }
    });

    it('intercetta RECITATION_BLOCKED e ritorna modelFail tipizzato', async () => {
      const adapter = createGeminiAdapter({
        apiKey: 'fake-key',
        model: 'gemini-3.5-pro'
      });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.RECITATION
              }
            ]
          })
        }
      };

      const result = await adapter.infer(sampleTriple);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('RECITATION_BLOCKED');
      }
    });

    it('notifica le metriche se onMetrics è configurato', async () => {
      const onMetrics = vi.fn();
      const adapter = createGeminiAdapter({
        apiKey: 'fake-key',
        model: 'gemini-3.5-flash',
        onMetrics
      });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [{ finishReason: FinishReason.STOP }],
            functionCalls: [{ name: 'cerca_documenti', args: {} }],
            usageMetadata: {
              promptTokenCount: 50,
              candidatesTokenCount: 20,
              totalTokenCount: 70
            }
          })
        }
      };

      await adapter.infer(sampleTriple);
      expect(onMetrics).toHaveBeenCalledTimes(1);
      expect(onMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          promptTokens: 50,
          candidatesTokens: 20,
          totalTokens: 70
        })
      );
    });
  });
});
