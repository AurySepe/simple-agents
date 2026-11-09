import { defineAgent } from '@formal-agent/core';
import { z } from 'zod';

/**
 * ============================================================================
 * I 3 SOLI MONUMENTI SUPPORTATI DAL SISTEMA
 * ============================================================================
 */
export const monumentEnum = z.enum(['colosseo', 'torre_di_pisa', 'duomo_milano']);
export type MonumentId = z.infer<typeof monumentEnum>;

export const cittaEnum = z.enum(['roma', 'pisa', 'milano']);
export type CittaId = z.infer<typeof cittaEnum>;

/**
 * Schemi dei tool intermedi (W)
 */
export const consultaOrariSchema = z.object({
  monumento: monumentEnum.describe(
    "L'identificativo esatto del monumento riconosciuto nell'immagine. Valori ammessi: 'colosseo', 'torre_di_pisa', 'duomo_milano'."
  )
});

export const consultaMeteoSchema = z.object({
  citta: cittaEnum.describe(
    "La città in cui risiede il monumento analizzato. Valori ammessi: 'roma', 'pisa', 'milano'."
  )
});

/**
 * Schemi delle terminazioni (A_term)
 */
export const concludiGuidaSchema = z.object({
  monumento: z.string().describe("Nome per esteso del monumento (es. 'Colosseo', 'Torre di Pisa', 'Duomo di Milano')."),
  citta: z.string().describe("Città in cui si trova il monumento."),
  descrizione_visiva: z.string().min(10).describe("Descrizione visiva di come appare il monumento nell'immagine."),
  orari: z.string().describe("Orari di apertura del monumento recuperati dal tool."),
  prezzo: z.string().describe("Costo del biglietto d'ingresso recuperato dal tool."),
  meteo_e_consigli: z.string().describe("Condizioni meteo attuali e consigli pratici per la visita.")
});

export const guidaNonDisponibileSchema = z.object({
  motivo: z.string().describe("Motivazione per cui la guida non è disponibile (il monumento non è uno dei 3 supportati)."),
  messaggio_scuse: z.string().describe("Messaggio formale di scuse all'utente per l'indisponibilità del servizio per questa immagine."),
  soggetto_rilevato: z.string().nullable().describe("Cosa è stato effettivamente rilevato nell'immagine al posto dei monumenti previsti, oppure null.")
});

export type ConcludiGuidaPayload = z.infer<typeof concludiGuidaSchema>;
export type GuidaNonDisponibilePayload = z.infer<typeof guidaNonDisponibileSchema>;

/**
 * ============================================================================
 * CONTRATTO DELL'AGENTE GUIDA TURISTICA
 * ============================================================================
 */
export const touristGuideContract = defineAgent({
  identity: "Agente Guida Turistica Intelligente (Specializzato su 3 Monumenti Italiani)",
  mission:
    "Osserva attentamente l'immagine fornita dall'utente.\n" +
    "- Se l'immagine NON ritrae alcuno dei 3 monumenti supportati ('colosseo', 'torre_di_pisa', 'duomo_milano'), " +
    "invoca IMMEDIATAMENTE l'azione di terminazione 'guida_non_disponibile' scusandoti con l'utente, senza chiamare altri tool.\n" +
    "- Se l'immagine ritrae uno dei 3 monumenti supportati, procedi rigorosamente a tappe:\n" +
    "  1. Al primo passo, invoca 'consulta_orari_biglietti' per recuperare orari e prezzi ufficiali del monumento.\n" +
    "  2. Al secondo passo, invoca 'consulta_meteo_citta' per verificare il meteo della città del monumento.\n" +
    "  3. Solo dopo aver ricevuto i risultati effettivi dei tool precedenti, invoca l'azione finale 'concludi_guida' " +
    "integrando i dati reali ottenuti (orari, prezzi, meteo e consigli) insieme alla descrizione visiva.",
  tools: {
    consulta_orari_biglietti: {
      description: "Recupera orari di apertura, prezzi dei biglietti e note storiche per uno dei 3 monumenti supportati.",
      parameters: consultaOrariSchema
    },
    consulta_meteo_citta: {
      description: "Recupera le condizioni meteo attuali e previsioni per una delle 3 città (roma, pisa, milano).",
      parameters: consultaMeteoSchema
    }
  },
  terminations: {
    concludi_guida: {
      description: "Conclude il processo presentando la scheda turistica completa comprensiva di dati dell'immagine, orari e meteo.",
      schema: concludiGuidaSchema
    },
    guida_non_disponibile: {
      description: "Termina il processo quando l'immagine non corrisponde a nessuno dei 3 monumenti supportati, scusandosi con l'utente.",
      schema: guidaNonDisponibileSchema
    }
  }
});
