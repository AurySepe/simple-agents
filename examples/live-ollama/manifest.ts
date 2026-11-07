import { z } from 'zod';
import { AgentManifest } from '../../src/index.js';

/**
 * ============================================================================
 * LIVELLO 3: IL MANIFESTO DELL'AGENTE (M_agent = <S0, A_int, A_term>)
 * ============================================================================
 * Definisce l'identità formale, lo stato iniziale (memoria e missione),
 * le capacità cognitive concesse e il contratto di chiusura rigido.
 */

// Schema formale di terminazione per il risultato finale dell'agente
export const rispondiETerminaSchema = z.object({
  cliente: z.string().describe('Nome e cognome del cliente'),
  categoria: z.string().describe('Categoria del cliente (es. VIP)'),
  ordine_id: z.string().describe("Identificativo dell'ordine scontato"),
  sconto_applicato: z.number().describe('Percentuale di sconto applicata'),
  totale_finale: z.number().describe("Totale finale dell'ordine in euro dopo lo sconto"),
  messaggio: z.string().describe('Messaggio chiaro e cortese di riepilogo per il cliente')
});

export type RispondiETerminaResult = z.infer<typeof rispondiETerminaSchema>;

export const commercialManifest: AgentManifest = {
  // Identità formale (I): definisce il ruolo e le regole/policy di business
  I: `Sei l'Assistente Commerciale Aziendale del Framework Ω.
Il tuo scopo è assistere i clienti nella gestione dei loro ordini e nell'applicazione delle condizioni commerciali previste, operando in piena autonomia decisionale nel rispetto delle policy aziendali.

### REGOLE E CONCETTI DI BUSINESS:
- Policy Sconto VIP: I clienti appartenenti alla categoria 'VIP' hanno diritto a uno sconto del 15% sul totale del proprio ordine aperto in stato di preparazione.
- Condizioni di Applicazione: L'applicazione dello sconto richiede di aver prima accertato l'effettiva appartenenza del cliente alla categoria 'VIP' e di aver individuato l'ordine aperto corrispondente.
- Chiusura della Richiesta: Una volta eseguite le verifiche e le eventuali modifiche necessarie nel Mondo, comunica l'esito definitivo al cliente tramite l'azione di terminazione 'rispondi_e_termina'.`,

  // Missione iniziale (Ms0)
  Ms0: 'In attesa di richieste commerciali da analizzare',

  // Stato epistemico iniziale (Ds0)
  Ds0: {
    anno_fiscale: 2026,
    policy_sconto_vip_percentuale: 15
  },

  // Tool fisici attivi e montati nel toolbelt iniziale (Ta0 ⊆ W)
  Ta0: ['w_cerca_cliente', 'w_dettaglio_ordini', 'w_applica_sconto'],

  // Contratti terminali tipizzati (A_term)
  A_term: [
    {
      id: 'rispondi_e_termina',
      description: 'Conclude il compito commerciale comunicando i dati definitivi e il messaggio di riepilogo al cliente.',
      schema: rispondiETerminaSchema
    }
  ]
};

