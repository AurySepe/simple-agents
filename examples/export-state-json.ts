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
  WorldTool
} from '../src/index.js';

async function runAndExport() {
  console.log('='.repeat(80));
  console.log('   ESPORTAZIONE STATO AGENTE IN FORMATO JSON (DEMO AUDIT TIMELINE)');
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
  // 3. Modello Linguistico deterministico (9 Passi su 3 Macro-Cicli)
  // ==========================================================================
  let step = 0;
  const model: LanguageModelAdapter = {
    infer: async () => {
      step++;

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
          calls: [{ id: 'call_db_1', name: 'w_db_ordini', payload: { cliente_id: 55 } }]
        };
      }

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

      throw new Error(`Passo inatteso: ${step}`);
    }
  };

  // ==========================================================================
  // 4. Raccoglitore di Telemetria e Stato
  // ==========================================================================
  const collector = new InMemoryTelemetryCollector();

  const runResult = await runtime.runAgent(manifest, model, {
    userContent: "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€.",
    observers: [collector]
  });

  // ==========================================================================
  // 5. Costruzione del documento JSON di Audit
  // ==========================================================================
  const inferences = collector.filterByType('model_inference');

  const auditDocument = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scenario: 'Walkthrough Commerciale: Verifica Preventivo e Applicazione Sconto',
      totalStepsExecuted: runResult.ticks,
      macroCyclesConsumed: runResult.macroCycles,
      exitContract: runResult.result.type,
      exitPayload: runResult.result.payload,
      finalState: {
        Ms: runResult.state.Ms,
        Ds: runResult.state.Ds,
        Ta: Array.from(runResult.state.Ta),
        Ka: Array.from(runResult.state.Ka.keys()),
        totalMessagesInHistory: runResult.state.Ep.length
      }
    },
    phasesTimeline: inferences.map((inf, idx) => {
      const state = inf.stateSnapshot;
      return {
        stepNumber: idx + 1,
        macroCycle: inf.macroCycle,
        tick: inf.tick,
        phase: inf.controlState,
        phaseDescription:
          inf.controlState === 'q_intro'
            ? 'Pianificazione interna (Introspezione)'
            : inf.controlState === 'q_exec'
            ? 'Azione operativa (Esecuzione nel Mondo)'
            : inf.controlState,
        directive: {
          type: inf.directive.type,
          prompt: inf.directive.prompt
        },
        stateBeforeStep: {
          scopo_Ms: state.Ms,
          memoria_Ds: state.Ds,
          tool_attivi_Ta: Array.from(state.Ta),
          policy_attive_Ka: Array.from(state.Ka ? state.Ka.keys() : []),
          messaggi_in_cronologia: state.Ep.length
        },
        modelInput: {
          systemFrame: inf.context.systemFrame,
          recentMessagesExtract: inf.context.messages.slice(-3).map((m) => ({
            role: m.role,
            channel: m.channel,
            callId: m.callId,
            content: m.content
          })),
          visibleToolsMask: inf.context.visibleTools.map((t) => t.id)
        },
        modelOutput: {
          thought: inf.output.thought,
          durationMs: inf.durationMs,
          callsEmitted: inf.output.calls.map((c) => ({
            id: c.id,
            name: c.name,
            arguments: c.payload
          }))
        }
      };
    })
  };

  const outputFileName = 'agent-state-audit.json';
  const outputPath = path.resolve(process.cwd(), outputFileName);

  fs.writeFileSync(outputPath, JSON.stringify(auditDocument, null, 2), 'utf8');

  console.log('='.repeat(80));
  console.log(`✅ FILE JSON CREATO CON SUCCESSO!`);
  console.log('='.repeat(80));
  console.log(`📁 Percorso file: ${outputPath}`);
  console.log(`📊 Passi registrati nella timeline: ${auditDocument.phasesTimeline.length}`);
  console.log(`🏁 Esito finale: ${runResult.result.type}`);
  console.log(`💾 Dimensione file: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB\n`);
  console.log('Puoi aprire direttamente "agent-state-audit.json" nel tuo editor per ispezionare');
  console.log('tutti i valori dello stato (Ms, Ds, Ta, Ka, messaggi, thought, chiamate) ad ogni fase.');
  console.log('='.repeat(80));
}

runAndExport().catch((err) => {
  console.error('Errore durante la generazione del JSON:', err);
  process.exit(1);
});
