import { defineAgent } from '@formal-agent/core';
import { z } from 'zod';

/**
 * ============================================================================
 * CONTRATTO TERMINALE DI DESCRIZIONE IMMAGINE (A_term)
 * ============================================================================
 */
export const concludiDescrizioneSchema = z.object({
  descrizione_generale: z
    .string()
    .min(10)
    .describe("Descrizione dettagliata ed esaustiva della scena o del soggetto principale dell'immagine."),
  elementi_chiave: z
    .array(z.string())
    .min(1)
    .describe("Elenco dei soggetti, oggetti, colori predominanti o caratteristiche salienti identificate."),
  testo_rilevato: z
    .string()
    .optional()
    .describe("Trascrizione letterale di eventuale testo, scritte, cartelli, loghi o etichette visibili.")
});

export type ConcludiDescrizionePayload = z.infer<typeof concludiDescrizioneSchema>;

/**
 * ============================================================================
 * CONTRATTO COGNITIVO PURO DELL'AGENTE (Livello 3 - Senza W/Tool)
 * ============================================================================
 * L'agente riceve una o più immagini tramite lo stimolo multimodale dell'utente
 * ed è focalizzato esclusivamente sull'analisi visiva e la restituzione
 * di una descrizione strutturata ad alta fedeltà.
 */
export const imageDescriberContract = defineAgent({
  identity: "Agente Osservatore Visivo e Analizzatore di Immagini",
  mission:
    "Osserva attentamente l'immagine fornita dall'utente ed emetti una descrizione strutturata completa, " +
    "identificando soggetti principali, contesto, elementi chiave ed eventuale testo visibile.",
  tools: {},
  terminations: {
    concludi_descrizione: {
      description: "Conclude l'analisi visiva fornendo la descrizione strutturata dell'immagine.",
      schema: concludiDescrizioneSchema
    }
  }
});
