import { z } from 'zod';
import { createWorldRegistry, WorldRegistry, WorldTool } from '../../src/index.js';

/**
 * ============================================================================
 * LIVELLO 2: IL MONDO AZIENDALE W (Strumenti Fisici e Database)
 * ============================================================================
 * Espone al runtime le capacità fisiche con cui l'agente interagisce
 * con l'esterno, tipizzate rigidamente tramite schemi Zod.
 */

export interface DatabaseClientiRecord {
  nome: string;
  categoria: 'STANDARD' | 'VIP';
  spesaAnnualeEuro: number;
}

export interface DatabaseOrdiniRecord {
  ordine_id: string;
  totaleEuro: number;
  stato: string;
  articoli: string[];
}

// Stato persistente simulato del database aziendale
export const databaseClienti: Record<number, DatabaseClientiRecord> = {
  42: { nome: 'Mario Rossi', categoria: 'VIP', spesaAnnualeEuro: 1850 }
};

export const databaseOrdini: Record<number, DatabaseOrdiniRecord> = {
  42: {
    ordine_id: 'ORD-2026-99',
    totaleEuro: 300.0,
    stato: 'IN_PREPARAZIONE',
    articoli: ['Monitor 4K Gaming']
  }
};

/**
 * Tool 1: Interrogazione CRM Clienti
 */
export const cercaClienteTool: WorldTool = {
  id: 'w_cerca_cliente',
  description: 'Interroga il CRM aziendale per recuperare i dati anagrafici e la categoria del cliente specificato.',
  parameters: z.object({
    cliente_id: z.number().int().positive().describe('Identificativo univoco del cliente')
  }),
  execute: async ({ cliente_id }) => {
    const cliente = databaseClienti[cliente_id];
    if (!cliente) {
      return { trovato: false, errore: `Nessun cliente trovato con ID ${cliente_id}` };
    }
    return { trovato: true, cliente_id, ...cliente };
  }
};

/**
 * Tool 2: Interrogazione Database Ordini
 */
export const dettaglioOrdiniTool: WorldTool = {
  id: 'w_dettaglio_ordini',
  description: 'Interroga il database ordini per recuperare gli ordini pendenti e il totale del cliente specificato.',
  parameters: z.object({
    cliente_id: z.number().int().positive().describe('Identificativo univoco del cliente')
  }),
  execute: async ({ cliente_id }) => {
    const ordine = databaseOrdini[cliente_id];
    if (!ordine) {
      return { trovato: false, messaggio: `Nessun ordine aperto per il cliente ${cliente_id}` };
    }
    return { trovato: true, ...ordine };
  }
};

/**
 * Tool 3: Modifica e Applicazione Sconto Commerciale
 */
export const applicaScontoTool: WorldTool = {
  id: 'w_applica_sconto',
  description: 'Modifica formalmente l ordine aperto nel sistema applicando la percentuale di sconto autorizzata.',
  parameters: z.object({
    ordine_id: z.string().describe("Identificativo dell'ordine (es. ORD-2026-99)"),
    percentuale: z.number().positive().max(50).describe('Percentuale di sconto da applicare (es. 15 per 15%)')
  }),
  execute: async ({ ordine_id, percentuale }) => {
    const entry = Object.values(databaseOrdini).find((o) => o.ordine_id === ordine_id);
    if (!entry) {
      return { esito: 'ERRORE', messaggio: `Ordine ${ordine_id} non trovato` };
    }
    const vecchioTotale = entry.totaleEuro;
    const scontoEuro = (vecchioTotale * percentuale) / 100;
    const nuovoTotale = vecchioTotale - scontoEuro;
    entry.totaleEuro = nuovoTotale;

    return {
      esito: 'APPLICATO',
      ordine_id,
      vecchio_totale: vecchioTotale,
      nuovo_totale: nuovoTotale,
      sconto_percentuale: percentuale
    };
  }
};

/**
 * Factory per il registro del Mondo W
 */
export function createCommercialWorld(): WorldRegistry {
  return createWorldRegistry([cercaClienteTool, dettaglioOrdiniTool, applicaScontoTool]);
}

