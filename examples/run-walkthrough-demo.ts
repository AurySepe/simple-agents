import { z } from 'zod';
import {
  AgentManifest,
  createConsoleObserver,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  LanguageModelAdapter,
  WorldTool
} from '../src/index.js';

async function main() {
  console.log('='.repeat(80));
  console.log('   ESECUZIONE DIMOSTRATIVA AUTONOMA: SCENARIO COMMERCIALE (3 MACRO-CICLI)');
  console.log('='.repeat(80));

  // ==========================================================================
  // 1. LIVELLO 1: Framework Engine Ω con Standard Library di Default
  // ==========================================================================
  const framework = new FrameworkEngine(createDefaultFrameworkConfig());

  // ==========================================================================
  // 2. LIVELLO 2: Il Mondo Aziendale W (Strumenti Fisici)
  // ==========================================================================
  const worldDatabase: Record<number, { ordine_id: string; totale: number; stato: string }> = {
    55: { ordine_id: 'ORD-99', totale: 200.0, stato: 'PREVENTIVO' }
  };

  const dbOrdiniTool: WorldTool = {
    id: 'w_db_ordini',
    description: 'Interroga il database degli ordini del cliente specificato per recuperare l ultimo preventivo.',
    parameters: z.object({
      cliente_id: z.number().int().positive()
    }),
    execute: async ({ cliente_id }) => {
      // Simuliamo una minima latenza di rete/database
      await new Promise((resolve) => setTimeout(resolve, 80));
      return worldDatabase[cliente_id];
    }
  };

  const applicaScontoTool: WorldTool = {
    id: 'w_applica_sconto',
    description: 'Modifica il preventivo applicando la percentuale di sconto concordata.',
    parameters: z.object({
      ordine_id: z.string(),
      percentuale: z.number().positive()
    }),
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { nuovo_totale: 170.0, esito: 'APPLICATO' };
    }
  };

  const world = createWorldRegistry([dbOrdiniTool, applicaScontoTool]);
  const runtime = framework.bindWorld(world);

  // ==========================================================================
  // 3. LIVELLO 3: Manifesto dell'Agente Commerciale
  // ==========================================================================
  const manifest: AgentManifest = {
    I: "Sei l'Assistente Commerciale Aziendale. Elabora preventivi e sconti nel rispetto delle policy.",
    Ms0: 'In attesa di richieste commerciali da analizzare',
    Ds0: { anno_fiscale: 2026 },
    A_int: [
      'aggiorna_missione',
      'imposta_dato',
      'cerca_tool',
      'carica_tool',
      'cerca_concetti',
      'carica_concetto'
    ],
    A_term: [
      {
        id: 'a_successo',
        description: 'Conclusione con successo dell applicazione dello sconto commerciale',
        schema: z.object({
          ordine_id: z.string(),
          totale_finale: z.number(),
          sconto_applicato: z.number()
        })
      }
    ]
  };

  // ==========================================================================
  // 4. MODELLO LINGUISTICO: Simulatore dei 9 Passi Formali
  // ==========================================================================
  let step = 0;
  const model: LanguageModelAdapter = {
    infer: async () => {
      step++;
      // Simuliamo la latenza di inferenza del modello LLM
      await new Promise((resolve) => setTimeout(resolve, 100));

      // --- MACRO-CICLO c = 0 (Introspezione, preparazione e query DB) ---
      if (step === 1) {
        return {
          thought: 'Ricevuta la richiesta di sconto per il cliente 55. Cerco le policy relative agli sconti e i tool di gestione ordini.',
          calls: [
            { id: 'call_c1', name: 'cerca_concetti', payload: { query: 'sconti clienti' } },
            { id: 'call_t1', name: 'cerca_tool', payload: { query: 'ordini' } }
          ]
        };
      }

      if (step === 2) {
        return {
          thought: 'Ho individuato la policy sconti 2026 e i tool per database e applicazione sconto. Li carico nella mia memoria di lavoro.',
          calls: [
            {
              id: 'call_m1',
              name: 'aggiorna_missione',
              payload: {
                nuovo_scopo: 'Verificare preventivo del cliente 55 e applicare lo sconto VIP autorizzato'
              }
            },
            {
              id: 'call_m2',
              name: 'carica_concetto',
              payload: { concetto_ids: ['pol_sconti_2026'] }
            },
            {
              id: 'call_m3',
              name: 'carica_tool',
              payload: { tool_ids: ['w_db_ordini', 'w_applica_sconto'] }
            }
          ]
        };
      }

      if (step === 3) {
        return {
          thought: 'Tutti i concetti e i tool sono montati. Concludo la preparazione interna per passare alla fase esecutiva.',
          calls: [{ id: 'call_close_0', name: 'a_concludi_intro', payload: {} }]
        };
      }

      if (step === 4) {
        return {
          thought: 'Fase Esecutiva: Interrogo il database del Mondo W per estrarre l ultimo preventivo del cliente 55.',
          calls: [
            {
              id: 'call_db_1',
              name: 'w_db_ordini',
              payload: { cliente_id: 55 }
            }
          ]
        };
      }

      // --- MACRO-CICLO c = 1 (Elaborazione dati preventivo e applicazione sconto) ---
      if (step === 5) {
        return {
          thought: 'Ricevuti dal Mondo i dati del preventivo ORD-99 (totale 200€). Salvo il dato strutturato nella memoria di lavoro Ds.',
          calls: [
            {
              id: 'call_ds_1',
              name: 'imposta_dato',
              payload: {
                chiave: 'preventivo_corrente',
                valore: { ordine_id: 'ORD-99', totale: 200.0 }
              }
            }
          ]
        };
      }

      if (step === 6) {
        return {
          thought: 'Dato salvato con successo. Chiudo la fase introspettiva.',
          calls: [{ id: 'call_close_1', name: 'a_concludi_intro', payload: {} }]
        };
      }

      if (step === 7) {
        return {
          thought: 'Il totale di 200€ supera la soglia minima di 150€ per clienti VIP: applico lo sconto autorizzato del 15%.',
          calls: [
            {
              id: 'call_disc_1',
              name: 'w_applica_sconto',
              payload: { ordine_id: 'ORD-99', percentuale: 15.0 }
            }
          ]
        };
      }

      // --- MACRO-CICLO c = 2 (Verifica finale e terminazione tipizzata) ---
      if (step === 8) {
        return {
          thought: 'Esito APPLICATO confermato dal Mondo W con nuovo totale di 170.0€. Chiudo subito l introspezione.',
          calls: [{ id: 'call_close_2', name: 'a_concludi_intro', payload: {} }]
        };
      }

      if (step === 9) {
        return {
          thought: 'Operazione completata con successo. Emetto il contratto di terminazione tipizzato a_successo.',
          calls: [
            {
              id: 'call_term_1',
              name: 'a_successo',
              payload: {
                ordine_id: 'ORD-99',
                totale_finale: 170.0,
                sconto_applicato: 15.0
              }
            }
          ]
        };
      }

      throw new Error(`Passo non previsto: ${step}`);
    }
  };

  // ==========================================================================
  // 5. OSSERVATORE DA CONSOLE (Configurato in modalità VERBOSE per stampare TUTTO)
  // ==========================================================================
  const logger = createConsoleObserver({
    level: 'verbose',
    showThoughts: true,
    showVisibleTools: true,
    showSystemFrame: true
  });

  // ==========================================================================
  // 6. ESECUZIONE AUTONOMA END-TO-END
  // ==========================================================================
  console.log('\n🚀 Avvio esecuzione autonoma...\n');

  const runResult = await runtime.runAgent(manifest, model, {
    userContent: "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€.",
    observers: [logger]
  });

  console.log('\n' + '='.repeat(80));
  console.log('   ESECUZIONE COMPLETATA CON SUCCESSO!');
  console.log('='.repeat(80));
  console.log('🏁 Contratto di uscita:', runResult.result.type);
  console.log('📦 Dati di uscita:', runResult.result.payload);
  console.log('🔄 Macro-cicli del Mondo consumati:', runResult.macroCycles);
  console.log('⏱️ Passi decisionali eseguiti:', runResult.ticks);
  console.log('🧠 Stato finale Ms (Missione):', runResult.state.Ms);
  console.log('💾 Stato finale Ds (Memoria):', runResult.state.Ds);
  console.log('='.repeat(80) + '\n');
}

main().catch((err) => {
  console.error('Errore durante la demo:', err);
  process.exit(1);
});

