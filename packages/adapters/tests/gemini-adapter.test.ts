import { describe, expect, it, vi, beforeEach } from 'vitest';
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

describe('Gemini Adapter Suite (Gemini 3 & 4)', () => {
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

  describe('cleanZodSchemaForGemini & GeminiStrategy', () => {
    it('rimuove $schema dalla serializzazione zod per compatibilità OpenAPI Gemini', () => {
      const schema = z.object({
        testo: z.string()
      });
      const cleaned = cleanZodSchemaForGemini(schema);
      expect(cleaned).not.toHaveProperty('$schema');
      expect(cleaned).toHaveProperty('type', 'object');
      expect(cleaned).toHaveProperty('properties');
    });

    it('formatta correttamente gli strumenti, le istruzioni di sistema e la cronologia episodica', () => {
      const strategy = new GeminiStrategy({
        toolChoice: 'required',
        thinking: {
          thinkingLevel: ThinkingLevel.HIGH,
          includeThoughts: true
        }
      });

      const formatted = strategy.format(sampleTriple);

      // System instruction
      expect(formatted.systemInstruction).toBeDefined();
      expect(formatted.systemInstruction?.parts[0].text).toContain('Sei un assistente per la ricerca');

      // Tools declarations
      expect(formatted.tools).toBeDefined();
      expect(formatted.tools?.[0].functionDeclarations).toHaveLength(1);
      expect(formatted.tools?.[0].functionDeclarations[0].name).toBe('cerca_documenti');

      // Tool config mode: ANY quando required
      expect(formatted.toolConfig?.functionCallingConfig?.mode).toBe(FunctionCallingConfigMode.ANY);

      // Thinking config
      expect(formatted.thinkingConfig?.thinkingLevel).toBe(ThinkingLevel.HIGH);
      expect(formatted.thinkingConfig?.includeThoughts).toBe(true);

      // Contents (history)
      expect(formatted.contents.length).toBeGreaterThan(0);
      const userMsg = formatted.contents.find((c) => c.role === 'user');
      expect(userMsg).toBeDefined();
      expect(userMsg?.parts[0]).toEqual({ text: 'Trova il bilancio 2025' });
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

      // 1. testo stimolo
      expect(userParts[0]).toEqual({ text: 'Descrivi questa scansione' });

      // 2. inlineData per immagine
      expect(userParts[1]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        }
      });

      // 3. text file formattato come blocco di testo
      expect(userParts[2]).toHaveProperty('text');
      expect((userParts[2] as { text: string }).text).toContain('[File: dati.csv]');
      expect((userParts[2] as { text: string }).text).toContain('id,nome\n1,Mario');
    });
  });

  describe('parseGeminiError', () => {
    it('gestisce timeout di rete (AbortError)', () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';

      const parsed = parseGeminiError(abortErr, 5000);
      expect(parsed.type).toBe('NETWORK_TIMEOUT');
      if (parsed.type === 'NETWORK_TIMEOUT') {
        expect(parsed.timeoutMs).toBe(5000);
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

  describe('GeminiModelAdapter', () => {
    it('inferisce invocazioni di tool con successo ritornando modelOk', async () => {
      const adapter = createGeminiAdapter({
        apiKey: 'fake-test-key',
        model: 'gemini-3.5-pro'
      });

      // Mock client.models.generateContent
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
      if (result.ok) {
        expect(result.data.thought).toBe('Rifletto sul documento da ricercare...');
        expect(result.data.calls).toHaveLength(1);
        expect(result.data.calls[0].name).toBe('cerca_documenti');
        expect(result.data.calls[0].payload).toEqual({ query: 'bilancio 2025', limite: 1 });
        expect(result.data.usage?.promptTokens).toBe(120);
        expect(result.data.usage?.completionTokens).toBe(45);
      }
    });

    it('ritorna fallback direct_response se il modello risponde con solo testo', async () => {
      const adapter = createGeminiAdapter({ apiKey: 'fake-key' });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [
              {
                finishReason: FinishReason.STOP,
                content: {
                  parts: [{ text: 'Risposta diretta testuale' }]
                }
              }
            ],
            functionCalls: undefined,
            text: 'Risposta diretta testuale'
          })
        }
      };

      const result = await adapter.infer(sampleTriple);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.calls).toHaveLength(1);
        expect(result.data.calls[0].name).toBe('direct_response');
        expect(result.data.calls[0].payload).toEqual({ text: 'Risposta diretta testuale' });
      }
    });

    it('intercetta SAFETY_BLOCKED e ritorna modelFail tipizzato', async () => {
      const adapter = createGeminiAdapter({ apiKey: 'fake-key' });

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
      const adapter = createGeminiAdapter({ apiKey: 'fake-key' });

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
        onMetrics
      });

      (adapter as any).client = {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            candidates: [{ finishReason: FinishReason.STOP }],
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
