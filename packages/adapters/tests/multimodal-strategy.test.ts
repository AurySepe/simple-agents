import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { InferenceTriple, UserMessageContent } from '@simple-agents/core';
import { SGLangQwenStrategy } from '../src/sglang/strategies/qwen-strategy.js';
import { OllamaQwenStrategy } from '../src/ollama/strategies/qwen-strategy.js';

describe('Multimodal Strategies - Livello 2 Adapters', () => {
  describe('SGLangQwenStrategy (OpenAI Compatible format)', () => {
    const strategy = new SGLangQwenStrategy();

    it('deve formattare kind: "text" come stringa semplice in content', () => {
      const triple: InferenceTriple = {
        systemFrame: 'System',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: { kind: 'text', text: 'Solo testo' }
          }
        ]
      };

      const formatted = strategy.formatContext(triple);
      const userMsg = formatted.messages.find((m) => m.role === 'user');
      expect(userMsg).toEqual({
        role: 'user',
        content: 'Solo testo'
      });
    });

    it('deve formattare kind: "text_with_media" con immagine inline in parti OpenAI', () => {
      const triple: InferenceTriple = {
        systemFrame: 'System',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: {
              kind: 'text_with_media',
              text: 'Guarda questa foto',
              files: [
                {
                  modality: 'image',
                  source: { kind: 'inline', data: 'aGVsbG8=', mimeType: 'image/png' },
                  filename: 'test.png'
                }
              ]
            }
          }
        ]
      };

      const formatted = strategy.formatContext(triple);
      const userMsg = formatted.messages.find((m) => m.role === 'user')!;
      expect(userMsg.role).toBe('user');
      expect(Array.isArray(userMsg.content)).toBe(true);

      const parts = userMsg.content as Array<{ type: string; [k: string]: any }>;
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ type: 'text', text: 'Guarda questa foto' });
      expect(parts[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,aGVsbG8=' }
      });
    });

    it('deve leggere da file system locale (path) e convertirlo in Base64', () => {
      const tmpFilePath = path.join(os.tmpdir(), 'formal_agent_test_img.png');
      fs.writeFileSync(tmpFilePath, Buffer.from('fake-image-bytes'));

      try {
        const triple: InferenceTriple = {
          systemFrame: 'System',
          visibleTools: [],
          messages: [
            {
              index: 0,
              type: 'stimulus',
              content: {
                kind: 'media',
                files: [
                  {
                    modality: 'image',
                    source: { kind: 'path', filePath: tmpFilePath }
                  }
                ]
              }
            }
          ]
        };

        const formatted = strategy.formatContext(triple);
        const userMsg = formatted.messages.find((m) => m.role === 'user')!;
        const parts = userMsg.content as Array<{ type: string; [k: string]: any }>;

        expect(parts[0].type).toBe('image_url');
        expect(parts[0].image_url.url).toContain('data:image/png;base64,');
      } finally {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
      }
    });

    it('deve includere file di codice (text_file) direttamente come blocchi di codice markdown', () => {
      const tmpCodePath = path.join(os.tmpdir(), 'calculator.ts');
      fs.writeFileSync(tmpCodePath, 'export const add = (a: number, b: number) => a + b;', 'utf-8');

      try {
        const triple: InferenceTriple = {
          systemFrame: 'System',
          visibleTools: [],
          messages: [
            {
              index: 0,
              type: 'stimulus',
              content: {
                kind: 'text_with_media',
                text: 'Esegui code review di questo file:',
                files: [
                  {
                    modality: 'text_file',
                    source: { kind: 'path', filePath: tmpCodePath },
                    filename: 'calculator.ts'
                  }
                ]
              }
            }
          ]
        };

        const formatted = strategy.formatContext(triple);
        const userMsg = formatted.messages.find((m) => m.role === 'user')!;
        const parts = userMsg.content as Array<{ type: string; [k: string]: any }>;

        expect(parts).toHaveLength(2);
        expect(parts[0]).toEqual({ type: 'text', text: 'Esegui code review di questo file:' });
        expect(parts[1].type).toBe('text');
        expect(parts[1].text).toContain('File calculator.ts:');
        expect(parts[1].text).toContain('export const add');
      } finally {
        if (fs.existsSync(tmpCodePath)) {
          fs.unlinkSync(tmpCodePath);
        }
      }
    });

    it('deve preservare la sequenza ordinata in kind: "interleaved"', () => {
      const triple: InferenceTriple = {
        systemFrame: 'System',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: {
              kind: 'interleaved',
              blocks: [
                { type: 'text', text: 'Prima:' },
                {
                  type: 'media',
                  media: {
                    modality: 'image',
                    source: { kind: 'url', url: 'https://example.com/before.jpg' }
                  }
                },
                { type: 'text', text: 'Dopo:' },
                {
                  type: 'media',
                  media: {
                    modality: 'image',
                    source: { kind: 'url', url: 'https://example.com/after.jpg' }
                  }
                }
              ]
            }
          }
        ]
      };

      const formatted = strategy.formatContext(triple);
      const userMsg = formatted.messages.find((m) => m.role === 'user')!;
      const parts = userMsg.content as Array<{ type: string; [k: string]: any }>;

      expect(parts).toHaveLength(4);
      expect(parts[0]).toEqual({ type: 'text', text: 'Prima:' });
      expect(parts[1]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/before.jpg' } });
      expect(parts[2]).toEqual({ type: 'text', text: 'Dopo:' });
      expect(parts[3]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/after.jpg' } });
    });
  });

  describe('OllamaQwenStrategy (Ollama images array format)', () => {
    const strategy = new OllamaQwenStrategy({ reasoningFormat: 'native_field' });

    it('deve mappare le immagini direttamente nel campo images del messaggio Ollama', () => {
      const triple: InferenceTriple = {
        systemFrame: 'System',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: {
              kind: 'text_with_media',
              text: 'Descrivi la foto',
              files: [
                {
                  modality: 'image',
                  source: { kind: 'inline', data: 'aW1nMQ==', mimeType: 'image/jpeg' }
                }
              ]
            }
          }
        ]
      };

      const formatted = strategy.formatContext(triple);
      const userMsg = formatted.messages.find((m) => m.role === 'user');
      expect(userMsg).toEqual({
        role: 'user',
        content: 'Descrivi la foto',
        images: ['aW1nMQ==']
      });
    });

    it('deve inlinare i file text_file all interno del campo content testuale di Ollama', () => {
      const triple: InferenceTriple = {
        systemFrame: 'System',
        visibleTools: [],
        messages: [
          {
            index: 0,
            type: 'stimulus',
            content: {
              kind: 'text_with_media',
              text: 'Controlla questo json:',
              files: [
                {
                  modality: 'text_file',
                  source: { kind: 'inline', data: Buffer.from('{"status": "ok"}').toString('base64'), mimeType: 'application/json' },
                  filename: 'status.json'
                }
              ]
            }
          }
        ]
      };

      const formatted = strategy.formatContext(triple);
      const userMsg = formatted.messages.find((m) => m.role === 'user')!;
      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toContain('Controlla questo json:');
      expect(userMsg.content).toContain('File status.json:');
      expect(userMsg.content).toContain('{"status": "ok"}');
      expect(userMsg.images).toBeUndefined();
    });
  });
});
