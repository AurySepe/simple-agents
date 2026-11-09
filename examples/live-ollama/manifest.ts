import { z } from 'zod';
import { AgentManifest } from '@formal-agent/core';

/**
 * ============================================================================
 * LIVELLO 3: IL MANIFESTO DELL'AGENTE (M_agent = <S0, A_int, A_term>)
 * ============================================================================
 * Definisce l'identità formale (I), lo stato iniziale (memoria Ds0, missione Ms0,
 * concetti e regole di business Ka0, tool attivi Ta0) e l'insieme dei contratti
 * di terminazione tipizzati (A_term), distinti per semantica di uscita.
 */

// ----------------------------------------------------------------------------
// 1. Contratto di Uscita Positiva: Conferma e Applicazione Sconto
// ----------------------------------------------------------------------------
export const confermaScontoSchema = z.object({
  cliente: z.string().describe('Nome e cognome del cliente'),
  categoria: z.string().describe('Categoria del cliente (es. VIP)'),
  ordine_id: z.string().describe("Identificativo dell'ordine scontato"),
  sconto_applicato: z.number().describe('Percentuale di sconto applicata'),
  totale_finale: z.number().describe("Totale finale dell'ordine in euro dopo lo sconto"),
  messaggio: z.string().describe('Messaggio chiaro e cortese di conferma e riepilogo per il cliente')
});
export type ConfermaScontoResult = z.infer<typeof confermaScontoSchema>;

// Alias retrocompatibile per schemi esistenti
export const rispondiETerminaSchema = confermaScontoSchema;
export type RispondiETerminaResult = ConfermaScontoResult;

// ----------------------------------------------------------------------------
// 2. Contratto di Uscita Negativa: Rifiuto Formale della Richiesta
// ----------------------------------------------------------------------------
export const rifiutaRichiestaSchema = z.object({
  cliente: z.string().describe('Nome o identificativo del cliente'),
  motivo: z.string().describe('Spiegazione chiara del motivo per cui lo sconto non può essere applicato'),
  ragione_codice: z.enum([
    'CLIENTE_NON_VIP',
    'ORDINE_NON_IN_PREPARAZIONE',
    'CLIENTE_NON_TROVATO',
    'NESSUN_ORDINE_APERTO',
    'ALTRO'
  ]).describe('Codice sintetico formale del motivo del rifiuto'),
  messaggio: z.string().describe('Messaggio cortese di diniego da comunicare al cliente')
});
export type RifiutaRichiestaResult = z.infer<typeof rifiutaRichiestaSchema>;

// ----------------------------------------------------------------------------
// 3. Contratto di Uscita per Escalation: Richiesta di Intervento Umano
// ----------------------------------------------------------------------------
export const richiediEscalationUmanaSchema = z.object({
  cliente: z.string().describe('Nome o ID del cliente coinvolto'),
  motivo: z.string().describe("Motivo del trasferimento verso l'operatore umano"),
  anomalia_riscontrata: z.string().describe("Descrizione dell'anomalia o incongruenza riscontrata"),
  urgenza: z.enum(['BASSA', 'MEDIA', 'ALTA']).describe('Livello di priorità/urgenza per il supporto'),
  messaggio: z.string().describe('Messaggio informativo per il cliente in attesa di verifica manuale')
});
export type RichiediEscalationUmanaResult = z.infer<typeof richiediEscalationUmanaSchema>;

// ----------------------------------------------------------------------------
// IL MANIFESTO COMMERCIALE
// ----------------------------------------------------------------------------
export const commercialManifest: AgentManifest = {
  // 1. Identità formale (I): definisce esclusivamente il ruolo e il perimetro operativo
  I: `Sei l'Assistente Commerciale Aziendale incaricato della gestione clienti e ordini.
Il tuo compito è assistere i clienti esaminando le loro richieste, verificando la loro anagrafica e lo stato dei loro ordini nel database aziendale, e applicando le condizioni e le policy commerciali stabilite prima di comunicare l'esito finale.`,

  // 2. Missione iniziale (Ms0)
  Ms0: 'Rispondere alle richieste commerciali dei clienti.',

  // 3. Conoscenza e Regole di Business Attive (Ka0): pure verità fattuali
  Ka0: [
    {
      id: 'policy_sconto_vip',
      descrizione: 'Condizioni di applicabilità dello sconto commerciale VIP',
      corpo: "Uno sconto del 15% sul totale dell'ordine è applicabile solo ed esclusivamente se il cliente appartiene alla categoria 'VIP' e il suo ordine in corso si trova nello stato 'IN_PREPARAZIONE'."
    }
  ],

  // 4. Tool fisici attivi e montati nel toolbelt iniziale (Ta0 ⊆ W)
  Ta0: ['w_cerca_cliente', 'w_dettaglio_ordini', 'w_applica_sconto'],

  // 5. Contratti terminali tipizzati (A_term) con semantiche distinte
  A_term: [
    {
      id: 'conferma_sconto',
      description: "Conclude l'attività con successo confermando l'applicazione dello sconto e fornendo i dati definitivi e il riepilogo al cliente.",
      schema: confermaScontoSchema
    },
    {
      id: 'rifiuta_richiesta',
      description: "Conclude l'attività rifiutando formalmente la richiesta di sconto qualora i requisiti di business non siano soddisfatti (es. cliente non VIP o ordine non in preparazione).",
      schema: rifiutaRichiestaSchema
    },
    {
      id: 'richiedi_escalation_umana',
      description: "Conclude l'attività trasferendo la pratica a un operatore umano in caso di anomalie nei dati, incongruenze o richieste speciali non gestibili in autonomia.",
      schema: richiediEscalationUmanaSchema
    }
  ]
};
