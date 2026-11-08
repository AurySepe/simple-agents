import { z } from 'zod';
import { createWorldRegistry, WorldRegistry, WorldTool } from '../../src/index.js';

/**
 * ============================================================================
 * LIVELLO 2: IL MONDO AZIENDALE W (Strumenti Fisici e Database Parametrizzabile)
 * ============================================================================
 * Espone al runtime le capacità fisiche con cui l'agente interagisce
 * con l'esterno, tipizzate rigidamente tramite schemi Zod di input e output.
 * Il database è completamente parametrizzabile per testare scenari diversi.
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

export interface CommercialDatabaseState {
  clienti?: Record<number, DatabaseClientiRecord>;
  ordini?: Record<number, DatabaseOrdiniRecord>;
}

// Database simulato di default
export const defaultDatabaseClienti: Record<number, DatabaseClientiRecord> = {
  42: { nome: 'Mario Rossi', categoria: 'VIP', spesaAnnualeEuro: 1850 }
};

export const defaultDatabaseOrdini: Record<number, DatabaseOrdiniRecord> = {
  42: {
    ordine_id: 'ORD-2026-99',
    totaleEuro: 300.0,
    stato: 'IN_PREPARAZIONE',
    articoli: ['Monitor 4K Gaming']
  }
};

// Alias per retrocompatibilità
export const databaseClienti = defaultDatabaseClienti;
export const databaseOrdini = defaultDatabaseOrdini;

/**
 * Schemi Zod di Ritorno per i Tool Fisici (sigma_out)
 */
export const cercaClienteReturnSchema = z.object({
  trovato: z.boolean().describe('Esito della ricerca nel CRM'),
  cliente_id: z.number().optional().describe('ID univoco cliente'),
  nome: z.string().optional().describe('Nome del cliente'),
  categoria: z.enum(['STANDARD', 'VIP']).optional().describe('Categoria commerciale'),
  spesaAnnualeEuro: z.number().optional().describe('Totale spesa annua in euro'),
  errore: z.string().optional().describe('Dettaglio in caso di cliente non trovato')
});

export const dettaglioOrdiniReturnSchema = z.object({
  trovato: z.boolean().describe('Esito della ricerca ordini'),
  ordine_id: z.string().optional().describe('ID ordine'),
  totaleEuro: z.number().optional().describe('Importo ordine in euro'),
  stato: z.string().optional().describe('Stato ordine (es. IN_PREPARAZIONE)'),
  articoli: z.array(z.string()).optional().describe('Elenco articoli acquistati'),
  messaggio: z.string().optional().describe('Dettaglio in caso di ordine non trovato')
});

export const applicaScontoReturnSchema = z.object({
  esito: z.string().describe('Stato operazione (APPLICATO o ERRORE)'),
  ordine_id: z.string().optional().describe('ID dell ordine'),
  vecchio_totale: z.number().optional().describe('Totale prima dello sconto'),
  nuovo_totale: z.number().optional().describe('Nuovo totale scontato in euro'),
  sconto_percentuale: z.number().optional().describe('Percentuale sconto applicata'),
  messaggio: z.string().optional().describe('Dettaglio errore se ordine non trovato')
});

/**
 * Factory per il registro del Mondo W con database parametrizzabile.
 * Isola lo stato del database per ogni sessione o scenario di test.
 */
export function createCommercialWorld(initialData?: CommercialDatabaseState): WorldRegistry {
  const dbClienti: Record<number, DatabaseClientiRecord> = initialData?.clienti
    ? { ...initialData.clienti }
    : { ...defaultDatabaseClienti };

  const dbOrdini: Record<number, DatabaseOrdiniRecord> = initialData?.ordini
    ? JSON.parse(JSON.stringify(initialData.ordini))
    : JSON.parse(JSON.stringify(defaultDatabaseOrdini));

  const cercaClienteTool: WorldTool = {
    id: 'w_cerca_cliente',
    description: 'Interroga il CRM aziendale per recuperare i dati anagrafici e la categoria del cliente specificato.',
    parameters: z.object({
      cliente_id: z.number().int().positive().describe('Identificativo univoco del cliente')
    }),
    returns: cercaClienteReturnSchema,
    execute: async ({ cliente_id }) => {
      const cliente = dbClienti[cliente_id];
      if (!cliente) {
        return { trovato: false, errore: `Nessun cliente trovato con ID ${cliente_id}` };
      }
      return { trovato: true, cliente_id, ...cliente };
    }
  };

  const dettaglioOrdiniTool: WorldTool = {
    id: 'w_dettaglio_ordini',
    description: 'Interroga il database ordini per recuperare gli ordini pendenti e il totale del cliente specificato.',
    parameters: z.object({
      cliente_id: z.number().int().positive().describe('Identificativo univoco del cliente')
    }),
    returns: dettaglioOrdiniReturnSchema,
    execute: async ({ cliente_id }) => {
      const ordine = dbOrdini[cliente_id];
      if (!ordine) {
        return { trovato: false, messaggio: `Nessun ordine aperto per il cliente ${cliente_id}` };
      }
      return { trovato: true, ...ordine };
    }
  };

  const applicaScontoTool: WorldTool = {
    id: 'w_applica_sconto',
    description: 'Modifica formalmente l ordine aperto nel sistema applicando la percentuale di sconto autorizzata.',
    parameters: z.object({
      ordine_id: z.string().describe("Identificativo dell'ordine (es. ORD-2026-99)"),
      percentuale: z.number().positive().max(50).describe('Percentuale di sconto da applicare (es. 15 per 15%)')
    }),
    returns: applicaScontoReturnSchema,
    execute: async ({ ordine_id, percentuale }) => {
      const entry = Object.values(dbOrdini).find((o) => o.ordine_id === ordine_id);
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

  return createWorldRegistry([cercaClienteTool, dettaglioOrdiniTool, applicaScontoTool]);
}

// Istanza per compatibilità export diretti
export const cercaClienteTool = createCommercialWorld().getToolDefinition('w_cerca_cliente') as WorldTool;
export const dettaglioOrdiniTool = createCommercialWorld().getToolDefinition('w_dettaglio_ordini') as WorldTool;
export const applicaScontoTool = createCommercialWorld().getToolDefinition('w_applica_sconto') as WorldTool;
