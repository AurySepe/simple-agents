import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import {
  AgentManifest,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  InMemoryTelemetryCollector,
  LanguageModelAdapter,
  ModularAuditExporter,
  WorldTool
} from '../src/index.js';

async function runAndExport() {
  console.log('='.repeat(80));
  console.log('   ESPORTAZIONE STRUTTURATA AUDIT FSM (DIVISIONE PER FASI E STEP IN Ω_op)');
  console.log('='.repeat(80));
  console.log('\n🚀 Esecuzione dello scenario commerciale in corso...\n');

  // ==========================================================================
  // 1. Framework Engine & World Registry
  // ==========================================================================
  const framework = new FrameworkEngine(createDefaultFrameworkConfig());

  const worldDatabase: Record<number, { ordine_id: string; totale: number; stato: string }> = {
    55: { ordine_id: 'ORD-99', totale: 200.0, stato: 'PREVENTIVO' }
  };

  const dbOrdiniTool: WorldTool = {
    id: 'w_db_ordini',
    description: 'Interroga il database ordini del cliente',
    parameters: z.object({ cliente_id: z.number().int().positive() }),
    execute: async ({ cliente_id }) => worldDatabase[cliente_id]
  };

  const applicaScontoTool: WorldTool = {
    id: 'w_applica_sconto',
    description: 'Applica percentuale sconto sul preventivo',
    parameters: z.object({ ordine_id: z.string(), percentuale: z.number().positive() }),
    execute: async () => ({ nuovo_totale: 170.0, esito: 'APPLICATO' })
  };

  const world = createWorldRegistry([dbOrdiniTool, applicaScontoTool]);
  const runtime = framework.bindWorld(world);

  // ==========================================================================
  // 2. Manifesto dell'Agente Commerciale
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
  // 3. Modello Linguistico deterministico
  // ==========================================================================
  let step = 0;
  const model: LanguageModelAdapter = {
    infer: async () => {
      step++;

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
  // 4. Esecuzione con InMemoryTelemetryCollector
  // ==========================================================================
  const collector = new InMemoryTelemetryCollector();

  const runResult = await runtime.runAgent(manifest, model, {
    userContent:
      "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€.",
    observers: [collector]
  });

  console.log(`✅ Esecuzione completata con esito '${runResult.result.type}' in ${runResult.macroCycles} macro-cicli.\n`);

  // ==========================================================================
  // 5. Esportazione Modulare tramite ModularAuditExporter
  // ==========================================================================
  const scratchDir = path.resolve(process.cwd(), 'scratch');
  const modularOutputDir = path.join(scratchDir, 'audit-commerciale');

  const exportResult = ModularAuditExporter.export(collector, {
    outputDir: modularOutputDir,
    scenarioName: 'Scenario Commerciale Sconto VIP (Ω_op)',
    generateHtmlDashboard: true
  });

  console.log('='.repeat(80));
  console.log('   REPORT ESPORTAZIONE MODULARE AUDIT');
  console.log('='.repeat(80));
  console.log(`Directory di destinazione: ${exportResult.outputDir}`);
  console.log(`Fasi FSM registrate:       ${exportResult.phasesCount}`);
  console.log(`Passi decisionali totali:  ${exportResult.stepsCount}`);
  console.log(`File indice generato:      ${exportResult.indexFilePath}`);
  console.log(`Dashboard HTML interattiva:${exportResult.htmlDashboardPath}\n`);

  // Mostra anteprima dell'indice JSON
  const indexContent = JSON.parse(fs.readFileSync(exportResult.indexFilePath, 'utf8'));
  console.log('📄 Struttura generata in index.json:');
  console.log(JSON.stringify({
    scenario: indexContent.scenario,
    statisticheGenerali: indexContent.statisticheGenerali,
    mappaFasiFSM: indexContent.mappaFasiFSM.map((f: any) => ({
      fase: f.fase,
      directory: f.directory,
      conteggioPassi: f.conteggioPassi
    }))
  }, null, 2));

  // Salvataggio anche del vecchio file flat unificato per retrocompatibilità
  const flatPath = path.join(scratchDir, 'agent-state-timeline.json');
  fs.writeFileSync(flatPath, collector.exportStateTimelineJSON(), 'utf8');
  console.log(`\n💾 Timeline flat unificata salvata in: ${flatPath}\n`);
}

runAndExport().catch(console.error);
