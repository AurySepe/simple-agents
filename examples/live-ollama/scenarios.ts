import { CommercialDatabaseState } from './world.js';

export interface CommercialTestScenario {
  id: string;
  titolo: string;
  descrizione: string;
  esitoAtteso: 'conferma_sconto' | 'rifiuta_richiesta' | 'richiedi_escalation_umana';
  ragioneAttesa?: string;
  database: CommercialDatabaseState;
  inputUtente: string;
}

/**
 * ============================================================================
 * BATTERIA DI SCENARI DI TEST PER L'AGENTE COMMERCIALE
 * ============================================================================
 * Copre tutte le biforcazioni logiche, contratti terminali ed edge case.
 */
export const commercialScenarios: Record<string, CommercialTestScenario> = {
  // --------------------------------------------------------------------------
  // Scenario 1: Happy Path (VIP + IN_PREPARAZIONE) -> conferma_sconto
  // --------------------------------------------------------------------------
  scenario_1_successo_vip: {
    id: 'scenario_1_successo_vip',
    titolo: '1. Successo Commerciale (Cliente VIP con Ordine in Preparazione)',
    descrizione: 'Il cliente è registrato come VIP e il suo ordine è in stato IN_PREPARAZIONE. Requisiti pienamente soddisfatti.',
    esitoAtteso: 'conferma_sconto',
    database: {
      clienti: {
        42: { nome: 'Mario Rossi', categoria: 'VIP', spesaAnnualeEuro: 1850 }
      },
      ordini: {
        42: {
          ordine_id: 'ORD-2026-99',
          totaleEuro: 300.0,
          stato: 'IN_PREPARAZIONE',
          articoli: ['Monitor 4K Gaming']
        }
      }
    },
    inputUtente:
      'Buongiorno, sono il cliente 42 (Mario Rossi). Vorrei sapere se posso avere lo sconto sul mio ordine in corso e a quanto ammonterebbe il totale.'
  },

  // --------------------------------------------------------------------------
  // Scenario 2: Rifiuto Cliente NON VIP -> rifiuta_richiesta (CLIENTE_NON_VIP)
  // --------------------------------------------------------------------------
  scenario_2_rifiuto_non_vip: {
    id: 'scenario_2_rifiuto_non_vip',
    titolo: '2. Rifiuto per Categoria (Cliente STANDARD, non VIP)',
    descrizione: 'Il cliente esiste e ha un ordine in preparazione, ma appartiene alla categoria STANDARD. Lo sconto non è applicabile.',
    esitoAtteso: 'rifiuta_richiesta',
    ragioneAttesa: 'CLIENTE_NON_VIP',
    database: {
      clienti: {
        101: { nome: 'Luigi Bianchi', categoria: 'STANDARD', spesaAnnualeEuro: 450 }
      },
      ordini: {
        101: {
          ordine_id: 'ORD-2026-101',
          totaleEuro: 150.0,
          stato: 'IN_PREPARAZIONE',
          articoli: ['Tastiera Meccanica RGB']
        }
      }
    },
    inputUtente:
      'Salve, sono Luigi Bianchi (ID: 101). Ho letto della promozione del 15% riservata ai clienti e vorrei applicarla al mio ordine in corso.'
  },

  // --------------------------------------------------------------------------
  // Scenario 3: Rifiuto Ordine NON IN PREPARAZIONE -> rifiuta_richiesta
  // --------------------------------------------------------------------------
  scenario_3_rifiuto_ordine_spedito: {
    id: 'scenario_3_rifiuto_ordine_spedito',
    titolo: '3. Rifiuto per Stato Ordine (Cliente VIP con Ordine già SPEDITO)',
    descrizione: 'La cliente è VIP, ma il suo ordine è già nello stato SPEDITO. La policy autorizza sconti solo su ordini IN_PREPARAZIONE.',
    esitoAtteso: 'rifiuta_richiesta',
    ragioneAttesa: 'ORDINE_NON_IN_PREPARAZIONE',
    database: {
      clienti: {
        202: { nome: 'Anna Verdi', categoria: 'VIP', spesaAnnualeEuro: 3200 }
      },
      ordini: {
        202: {
          ordine_id: 'ORD-2026-202',
          totaleEuro: 500.0,
          stato: 'SPEDITO',
          articoli: ['Smartphone Flagship 2026']
        }
      }
    },
    inputUtente:
      'Ciao! Sono Anna Verdi (ID cliente: 202). Sono una cliente VIP, potete applicare lo sconto del 15% sul mio ordine ORD-2026-202?'
  },

  // --------------------------------------------------------------------------
  // Scenario 4: Rifiuto Cliente Non Trovato -> rifiuta_richiesta
  // --------------------------------------------------------------------------
  scenario_4_rifiuto_cliente_inesistente: {
    id: 'scenario_4_rifiuto_cliente_inesistente',
    titolo: '4. Rifiuto per Anagrafica Assente (Cliente non presente nel CRM)',
    descrizione: 'L ID fornito non esiste nel database del CRM. L agente non può verificare lo status né procedere.',
    esitoAtteso: 'rifiuta_richiesta',
    ragioneAttesa: 'CLIENTE_NON_TROVATO',
    database: {
      clienti: {
        42: { nome: 'Mario Rossi', categoria: 'VIP', spesaAnnualeEuro: 1850 }
      },
      ordini: {}
    },
    inputUtente:
      'Buongiorno, sono Giuseppe Neri (ID cliente: 999). Vorrei sapere se ho diritto allo sconto VIP sul mio ordine.'
  },

  // --------------------------------------------------------------------------
  // Scenario 5: Rifiuto Nessun Ordine Aperto -> rifiuta_richiesta
  // --------------------------------------------------------------------------
  scenario_5_rifiuto_nessun_ordine: {
    id: 'scenario_5_rifiuto_nessun_ordine',
    titolo: '5. Rifiuto per Assenza Ordini (Cliente VIP senza ordini attivi)',
    descrizione: 'La cliente è confermata VIP, ma non ha alcun ordine registrato nel database ordini.',
    esitoAtteso: 'rifiuta_richiesta',
    ragioneAttesa: 'NESSUN_ORDINE_APERTO',
    database: {
      clienti: {
        303: { nome: 'Paola Neri', categoria: 'VIP', spesaAnnualeEuro: 2100 }
      },
      ordini: {}
    },
    inputUtente:
      'Salve, sono Paola Neri (ID: 303). Sono una cliente VIP da tempo, vorrei applicare lo sconto sul mio ordine in corso.'
  },

  // --------------------------------------------------------------------------
  // Scenario 6: Escalation Umana -> richiedi_escalation_umana
  // --------------------------------------------------------------------------
  scenario_6_escalation_anomalia: {
    id: 'scenario_6_escalation_anomalia',
    titolo: '6. Escalation Umana (Anomalia Amministrativa e Contestazione Ordine)',
    descrizione: 'Il cliente è VIP ma l ordine è bloccato in stato CONTESTATO_DISGUIDO e l utente chiede accordi speciali non gestibili in autonomia.',
    esitoAtteso: 'richiedi_escalation_umana',
    database: {
      clienti: {
        404: { nome: 'Carlo Conti', categoria: 'VIP', spesaAnnualeEuro: 4500 }
      },
      ordini: {
        404: {
          ordine_id: 'ORD-2026-404',
          totaleEuro: 1200.0,
          stato: 'CONTESTATO_DISGUIDO',
          articoli: ['Workstation Grafica Pro']
        }
      }
    },
    inputUtente:
      'Buongiorno, sono Carlo Conti (ID: 404), cliente VIP. Il mio ordine ORD-2026-404 risulta bloccato dall amministrazione da due settimane per un disguido, ho concordato uno sconto speciale con la direzione, potete verificare la pratica e sbloccarla?'
  }
};

