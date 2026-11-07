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
  console.log('   ESECUZIONE DIMOSTRATIVA AUTONOMA: SCENARIO COMMERCIALE (3 MACRO-CICLI IN Ω_op)');
  console.log('='.repeat(80));

  // ==========================================================================
  // 1. LIVELLO 1: Framework Engine Ω_op con Standard Library di Default
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
  // 3. LIVELLO 3: Manifesto dell'Agente Commerciale Operativo
  // ==========================================================================
  const manifest: AgentManifest = {
    I: "Sei l'Assistente Commerciale Aziendale. Elabora preventivi e sconti nel rispetto delle policy.",
    Ms0: 'Verificare preventivo del cliente 55 e applicare lo sconto VIP autorizzato',
    Ds0: { anno_fiscale: 2026 },
    Ta0: ['w_db_ordini', 'w_applica_sconto'],
    Ka0: [
      {
        id: 'pol_sconti_2026',
        descrizione: 'Policy sconti 2026',
        corpo: 'Preventivi oltre 150€ hanno diritto al 15% di sconto.'
      }
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
  // 4. MODELLO LINGUISTICO: Simulatore dei 3 Passi Operativi
  // ==========================================================================
  let step = 0;
  const model: LanguageModelAdapter = {
    infer: async () => {
      step++;
      await new Promise((resolve) => setTimeout(resolve, 100));

      // --- MACRO-CICLO c = 0 (Query al DB del Mondo) ---
      if (step === 1) {
        return {
          thought: 'Ricevuta la richiesta per il cliente 55. Interrogo il database per recuperare il preventivo.',
          calls: [
            {
              id: 'call_db_1',
              name: 'w_db_ordini',
              payload: { cliente_id: 55 }
            }
          ]
        };
      }

      // --- MACRO-CICLO c = 1 (Applicazione dello sconto nel Mondo) ---
      if (step === 2) {
        return {
          thought: 'Il preventivo ORD-99 ammonta a 200€, superando la soglia di 150€. Applico lo sconto del 15%.',
          calls: [
            {
              id: 'call_disc_1',
              name: 'w_applica_sconto',
              payload: { ordine_id: 'ORD-99', percentuale: 15.0 }
            }
          ]
        };
      }

      // --- MACRO-CICLO c = 2 (Terminazione tipizzata) ---
      if (step === 3) {
        return {
          thought: 'Lo sconto è stato applicato correttamente. Posso chiudere il processo con il contratto a_successo.',
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

      throw new Error(`Passo inatteso: ${step}`);
    }
  };

  // ==========================================================================
  // 5. OBSERVER & LOGGER CONSOLE A COLORI
  // ==========================================================================
  const consoleObserver = createConsoleObserver({
    prefix: '[AGENTE-COMMERCIALE]',
    includeTimestamp: true
  });

  // ==========================================================================
  // 6. ESECUZIONE AUTONOMA END-TO-END
  // ==========================================================================
  console.log('\n🚀 Avvio esecuzione autonoma runtime.runAgent()...\n');

  const startTime = Date.now();
  const runResult = await runtime.runAgent(manifest, model, {
    userContent:
      "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€.",
    observers: [consoleObserver]
  });
  const duration = Date.now() - startTime;

  console.log('\n' + '='.repeat(80));
  console.log('   RISULTATO FINALE DELL ESECUZIONE');
  console.log('='.repeat(80));
  console.log(`Esito Contratto: ${runResult.result.type}`);
  console.log(`Dati Restituiti: ${JSON.stringify(runResult.result.payload, null, 2)}`);
  console.log(`Macro-Cicli di Mondo (c): ${runResult.macroCycles}`);
  console.log(`Tick Decisionali Totali (t): ${runResult.ticks}`);
  console.log(`Tempo Totale Esecuzione: ${duration} ms\n`);
}

main().catch(console.error);
