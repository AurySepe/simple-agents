import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ConsoleLogger,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  isUserMessageContent,
  type LanguageModelAdapter,
  type UserMessageContent
} from '../src/index.js';

describe('Multimodal & File Input Ontology - Livello 1 Core', () => {
  describe('Type Guard: isUserMessageContent', () => {
    it('deve riconoscere correttamente kind: "text"', () => {
      const validText: UserMessageContent = {
        kind: 'text',
        text: 'Analizza i dati'
      };
      expect(isUserMessageContent(validText)).toBe(true);
    });

    it('deve riconoscere correttamente kind: "media"', () => {
      const validMedia: UserMessageContent = {
        kind: 'media',
        files: [
          {
            modality: 'image',
            source: { kind: 'inline', data: 'aGVsbG8=', mimeType: 'image/png' },
            filename: 'screenshot.png'
          }
        ]
      };
      expect(isUserMessageContent(validMedia)).toBe(true);
    });

    it('deve riconoscere correttamente kind: "text_with_media"', () => {
      const validTextWithMedia: UserMessageContent = {
        kind: 'text_with_media',
        text: 'Trascrivi il contenuto di questa immagine',
        files: [
          {
            modality: 'image',
            source: { kind: 'url', url: 'https://example.com/receipt.jpg' }
          }
        ]
      };
      expect(isUserMessageContent(validTextWithMedia)).toBe(true);
    });

    it('deve riconoscere correttamente kind: "interleaved"', () => {
      const validInterleaved: UserMessageContent = {
        kind: 'interleaved',
        blocks: [
          { type: 'text', text: 'Confronta questa immagine:' },
          {
            type: 'media',
            media: {
              modality: 'image',
              source: { kind: 'inline', data: 'aW1nMQ==', mimeType: 'image/png' }
            }
          },
          { type: 'text', text: 'con questa seconda immagine:' },
          {
            type: 'media',
            media: {
              modality: 'image',
              source: { kind: 'inline', data: 'aW1nMg==', mimeType: 'image/png' }
            }
          }
        ]
      };
      expect(isUserMessageContent(validInterleaved)).toBe(true);
    });

    it('deve rifiutare oggetti privi di kind o con kind invalido', () => {
      expect(isUserMessageContent(null)).toBe(false);
      expect(isUserMessageContent(undefined)).toBe(false);
      expect(isUserMessageContent('stringa pura')).toBe(false);
      expect(isUserMessageContent({})).toBe(false);
      expect(isUserMessageContent({ kind: 'sconosciuto' })).toBe(false);
      expect(isUserMessageContent({ kind: 'media', files: [] })).toBe(false); // file array vuoto non ammesso
      expect(isUserMessageContent({ kind: 'interleaved', blocks: [] })).toBe(false); // blocks vuoto non ammesso
    });
  });

  describe('Accodamento e Tracciamento in Ep', () => {
    it('l orchestratore deve accettare UserMessageContent e registrarlo nella traccia Ep', async () => {
      const framework = new FrameworkEngine(createDefaultFrameworkConfig());
      const world = createWorldRegistry();
      const runtime = framework.bindWorld(world);

      const manifest = {
        I: 'Agente Vision Test',
        Ms0: 'Analizza media',
        A_term: [
          {
            id: 'termina',
            description: 'Conclude',
            schema: z.object({ esito: z.string() })
          }
        ]
      };

      const mockModel: LanguageModelAdapter = {
        async infer(triple) {
          // Verifica che il messaggio in Ep contenga il payload multimodale strutturato
          const stimulus = triple.messages.find((m) => m.type === 'stimulus');
          expect(stimulus).toBeDefined();
          expect(stimulus?.content).toEqual({
            kind: 'text_with_media',
            text: 'Verifica allegato',
            files: [
              {
                modality: 'document',
                source: { kind: 'inline', data: 'UEZG...', mimeType: 'application/pdf' },
                filename: 'contratto.pdf'
              }
            ]
          });

          return {
            status: 'success',
            thought: 'Ho ricevuto il documento e posso terminare.',
            calls: [{ id: 'c1', name: 'termina', payload: { esito: 'Ricevuto' } }]
          };
        }
      };

      const result = await runtime.runAgent(manifest, mockModel, {
        userContent: {
          kind: 'text_with_media',
          text: 'Verifica allegato',
          files: [
            {
              modality: 'document',
              source: { kind: 'inline', data: 'UEZG...', mimeType: 'application/pdf' },
              filename: 'contratto.pdf'
            }
          ]
        }
      });

      expect(result.status).toBe('halt');
    });
  });

  describe('ConsoleLogger con UserMessageContent', () => {
    it('deve formattare in modo chiaro gli allegati e il testo', () => {
      const logs: string[] = [];
      const logger = new ConsoleLogger({
        writer: (msg) => logs.push(msg),
        useColors: false
      });

      logger.onEvent({
        type: 'macro_cycle_start',
        macroCycle: 0,
        tick: 0,
        timestamp: new Date(),
        userContent: {
          kind: 'text_with_media',
          text: 'Analizza il grafico',
          files: [
            {
              modality: 'image',
              source: { kind: 'inline', data: 'abc', mimeType: 'image/png' },
              filename: 'chart.png'
            }
          ]
        }
      });

      const joined = logs.join('\n');
      expect(joined).toContain('Analizza il grafico');
      expect(joined).toContain('1 attachments: image (chart.png)');
    });
  });
});
