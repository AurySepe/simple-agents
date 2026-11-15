import { describe, expect, it } from 'vitest';
import {
  concludiDescrizioneSchema,
  imageDescriberContract
} from '../contract.js';
import { imageDescriberAgent } from '../implementation.js';
import {
  createDefaultFrameworkConfig,
  FrameworkEngine,
  type LanguageModelAdapter,
  type ModelResult
} from '@formal-agent/core';

describe('Image Describer Agent - Suite di Test', () => {
  describe('Contratto Cognitivo (contract.ts)', () => {
    it('deve definire identità e missione dell agente visivo', () => {
      expect(imageDescriberContract.contract.identity).toContain('Osservatore Visivo');
      expect(imageDescriberContract.contract.mission).toContain('Osserva attentamente');
    });

    it('deve validare payload validi per concludi_descrizione', () => {
      const validPayload = {
        descrizione_generale: 'Una veduta panoramica di un paesaggio alpino al tramonto.',
        elementi_chiave: ['Montagne innevate', 'Cielo arancione', 'Pini in primo piano'],
        testo_rilevato: 'Rifugio Monte Bianco'
      };

      expect(() => concludiDescrizioneSchema.parse(validPayload)).not.toThrow();
    });

    it('deve rifiutare descrizioni troppo brevi o prive di elementi chiave', () => {
      expect(() =>
        concludiDescrizioneSchema.parse({
          descrizione_generale: 'Breve',
          elementi_chiave: []
        })
      ).toThrow();
    });
  });

  describe('Binding Esecutivo (implementation.ts)', () => {
    it('l agente implementato deve avere un Mondo vuoto (nessun tool)', () => {
      const bound = imageDescriberAgent.bind(undefined);
      const tools = bound.world.getAllDefinitions();
      expect(tools).toHaveLength(0);
    });

    it('deve possedere la terminazione concludi_descrizione nel manifest', () => {
      const bound = imageDescriberAgent.bind(undefined);
      const terminations = bound.manifest.A_term;
      expect(terminations.some((t) => t.id === 'concludi_descrizione')).toBe(true);
    });
  });

  describe('Esecuzione End-to-End con Modello Mock', () => {
    it('deve eseguire la descrizione visiva e terminare con successo in 1 macro-ciclo', async () => {
      const engine = new FrameworkEngine(createDefaultFrameworkConfig());

      const mockVlmModel: LanguageModelAdapter = {
        async infer(triple): Promise<ModelResult> {
          // Verifica che il modello riceva il messaggio stimolo contenente l'immagine
          const stimulus = triple.messages.find((m) => m.type === 'stimulus');
          expect(stimulus).toBeDefined();

          return {
            status: 'success',
            thought: 'Ho analizzato l immagine e posso descriverne il contenuto.',
            calls: [
              {
                id: 'call_desc_1',
                name: 'concludi_descrizione',
                payload: {
                  descrizione_generale: 'Un paesaggio costiero con scogliere a picco sul mare limpido.',
                  elementi_chiave: ['Scogliera', 'Mare blu', 'Gabbiani in volo'],
                  testo_rilevato: 'Area Marina Protetta'
                }
              }
            ]
          };
        }
      };

      const outcome = await imageDescriberAgent.bind(undefined).run(engine, mockVlmModel, {
        userContent: {
          kind: 'text_with_media',
          text: 'Descrivi la foto',
          files: [
            {
              modality: 'image',
              source: { kind: 'inline', data: 'ZmFrZS1pbWFnZQ==', mimeType: 'image/jpeg' },
              filename: 'paesaggio.jpg'
            }
          ]
        }
      });

      expect(outcome.status).toBe('halt');
      if (outcome.status === 'halt') {
        expect(outcome.result.type).toBe('concludi_descrizione');
        expect(outcome.result.payload.elementi_chiave).toContain('Scogliera');
        expect(outcome.result.payload.testo_rilevato).toBe('Area Marina Protetta');
      }
    });
  });
});
