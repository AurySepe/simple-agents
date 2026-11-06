import { describe, expect, it } from 'vitest';
import {
  AgentManifest,
  AggiornaMissioneSchema,
  CaricaConcettoSchema,
  CaricaToolSchema,
  CercaConcettiSchema,
  CercaToolSchema,
  CognitiveToolkit,
  CompattaMemoriaSchema,
  EliminaDatoSchema,
  FrameworkConfig,
  FrameworkEngine,
  ImpostaDatoSchema,
  OrchestratorPolicy,
  ScaricaConcettoSchema,
  ScaricaToolSchema,
  SystemFrameProjector
} from '../src/index.js';

describe('Livello 1: Istanziazione del FrameworkEngine Immutabile', () => {
  it('dovrebbe obbligare a tempo di compilazione a definire tutte e 10 le azioni cognitive canoniche', () => {
    /**
     * ========================================================================
     * PARAMETRO 1 DI LIVELLO 1: Primitive Cognitive Canoniche (CognitiveToolkit)
     * ========================================================================
     * TypeScript impone che TUTTE e 10 le azioni canoniche siano definite.
     * I valori (descrizioni, schemi, logica di execute) sono al 100% liberi.
     */
    const myCognitiveTools: CognitiveToolkit = {
      // 1. Missione
      aggiorna_missione: {
        id: 'aggiorna_missione',
        description: "Modifica esplicitamente l'obiettivo a breve termine dell'agente (Ms).",
        parameters: AggiornaMissioneSchema,
        execute: (args, state) => {
          state.Ms = args.nuovo_scopo;
          return `Missione impostata su: '${args.nuovo_scopo}'`;
        }
      },

      // 2. Imposta Dato in Ds
      imposta_dato: {
        id: 'imposta_dato',
        description: 'Inserisce o aggiorna una variabile nella memoria di lavoro strutturata (Ds).',
        parameters: ImpostaDatoSchema,
        execute: (args, state) => {
          state.Ds[args.chiave] = args.valore;
          return `Chiave '${args.chiave}' salvata in Ds`;
        }
      },

      // 3. Elimina Dato da Ds
      elimina_dato: {
        id: 'elimina_dato',
        description: 'Rimuove una chiave dalla memoria di lavoro strutturata (Ds).',
        parameters: EliminaDatoSchema,
        execute: (args, state) => {
          delete state.Ds[args.chiave];
          return `Chiave '${args.chiave}' rimossa da Ds`;
        }
      },

      // 4. Compattazione causale su Ep
      compatta_memoria: {
        id: 'compatta_memoria',
        description: 'Sintetizza una sotto-sequenza di messaggi in Ep per risparmiare contesto.',
        parameters: CompattaMemoriaSchema,
        execute: (args, state) => {
          const removedCount = args.end_idx - args.start_idx + 1;
          state.Ep.splice(args.start_idx, removedCount, {
            index: args.start_idx,
            role: 'orchestrator',
            channel: 'summary',
            content: args.sintesi
          });
          return `Compattati ${removedCount} messaggi`;
        }
      },

      // 5. Cerca Tool in W
      cerca_tool: {
        id: 'cerca_tool',
        description: 'Ispezione passiva del catalogo strumenti del Mondo.',
        parameters: CercaToolSchema,
        execute: (args) => {
          return `Ricerca eseguita per query: '${args.query}'`;
        }
      },

      // 6. Carica Tool in Ta
      carica_tool: {
        id: 'carica_tool',
        description: 'Attiva uno strumento nel toolbelt Ta.',
        parameters: CaricaToolSchema,
        execute: (args, state) => {
          for (const id of args.tool_ids) {
            state.Ta.add(id);
          }
          return `Tool attivati: ${args.tool_ids.join(', ')}`;
        }
      },

      // 7. Scarica Tool da Ta
      scarica_tool: {
        id: 'scarica_tool',
        description: 'Disattiva uno strumento dal toolbelt Ta.',
        parameters: ScaricaToolSchema,
        execute: (args, state) => {
          for (const id of args.tool_ids) {
            state.Ta.delete(id);
          }
          return `Tool rimossi: ${args.tool_ids.join(', ')}`;
        }
      },

      // 8. Cerca Concetti
      cerca_concetti: {
        id: 'cerca_concetti',
        description: 'Ispezione passiva dell archivio concetti semantici.',
        parameters: CercaConcettiSchema,
        execute: (args) => {
          return `Ricerca concetti per query: '${args.query}'`;
        }
      },

      // 9. Carica Concetto in Ka
      carica_concetto: {
        id: 'carica_concetto',
        description: 'Carica concetti a piena consapevolezza nel buffer Ka.',
        parameters: CaricaConcettoSchema,
        execute: (args, state) => {
          for (const id of args.concetto_ids) {
            state.Ka.set(id, { id, descrizione: `Concetto ${id}`, corpo: `Corpo del concetto ${id}` });
          }
          return `Concetti caricati: ${args.concetto_ids.join(', ')}`;
        }
      },

      // 10. Scarica Concetto da Ka
      scarica_concetto: {
        id: 'scarica_concetto',
        description: 'Evacua concetti non piu necessari dal buffer Ka.',
        parameters: ScaricaConcettoSchema,
        execute: (args, state) => {
          for (const id of args.concetto_ids) {
            state.Ka.delete(id);
          }
          return `Concetti rimossi: ${args.concetto_ids.join(', ')}`;
        }
      }
    };

    /**
     * ========================================================================
     * PARAMETRO 2 DI LIVELLO 1: Funzione di Proiezione del Frame F_Ω (System)
     * ========================================================================
     */
    const mySystemFrameProjector: SystemFrameProjector = (directive, state) => {
      const parts: string[] = [];
      parts.push(`# IDENTITÀ:\n${state.I}`);
      parts.push(`# OBIETTIVO CORRENTE:\n${state.Ms}`);

      if (Object.keys(state.Ds).length > 0) {
        parts.push(`# DATI:\n${JSON.stringify(state.Ds)}`);
      }

      if (directive.type === 'err_schema') {
        parts.push(
          `# ERRORE DI SCHEMA:\nStrumento '${directive.targetToolId}' non valido.\nDettaglio: ${directive.schemaErrorDetail}`
        );
      }

      return parts.join('\n\n');
    };

    /**
     * ========================================================================
     * PARAMETRO 3 DI LIVELLO 1: Policy dei Testi delle Direttive e degli Errori
     * ========================================================================
     */
    const myPolicy: OrchestratorPolicy = {
      formatDirectivePrompt: (type) => {
        switch (type) {
          case 'start_intro':
            return 'Modalità introspettiva attiva. Allinea il tuo stato interno prima di interagire.';
          case 'loop_intro':
            return 'Stato aggiornato. Esegui ulteriori modifiche cognitive o concludi con a_concludi_intro.';
          case 'start_exec':
            return 'Introspezione chiusa. Esegui azioni sul mondo esterno o termina con un contratto di uscita.';
        }
      },
      formatSchemaErrorPrompt: (targetToolId, errorDetail) => {
        return `Errore di schema sull'azione '${targetToolId}': ${errorDetail}. Correggi i parametri o rinuncia con a_abort_call.`;
      },
      formatSyntaxErrorPrompt: (targetToolId, rawText, errorDetail) => {
        return `Errore di sintassi JSON sull'azione '${targetToolId}': ${errorDetail}. Testo non parsabile: "${rawText}".`;
      },
      formatDirectiveMessageContent: (directive) => {
        return `[DIRETTIVA: ${directive.type.toUpperCase()}] ${directive.prompt}`;
      },
      formatAbortResultContent: (targetToolId) => {
        return `Richiesta di esecuzione per '${targetToolId}' revocata dall'agente.`;
      },
      formatVoidResultContent: () => {
        return 'OK';
      },
      formatControlActionDescription: (action) => {
        return `Azione di controllo: ${action}`;
      },
      formatInternalErrorDetail: (kind, context) => {
        return `Errore interno: ${kind}${context?.toolId ? ` su ${context.toolId}` : ''}`;
      },
      validationMessages: {
        nuovo_scopo_required: 'Scopo non valido',
        chiave_required: 'Chiave non valida',
        query_required: 'Query non valida',
        tool_ids_required: 'Tool IDs non validi',
        concetto_ids_required: 'Concetto IDs non validi',
        sintesi_required: 'Sintesi non valida',
        invalid_indices: 'Indici non validi'
      },
      cognitiveMetadata: {
        aggiorna_missione: { toolName: 'aggiorna_missione', description: 'Aggiorna Ms' },
        imposta_dato: { toolName: 'imposta_dato', description: 'Imposta Ds' },
        elimina_dato: { toolName: 'elimina_dato', description: 'Elimina Ds' },
        compatta_memoria: { toolName: 'compatta_memoria', description: 'Compatta Ep' },
        cerca_tool: { toolName: 'cerca_tool', description: 'Cerca tool' },
        carica_tool: { toolName: 'carica_tool', description: 'Carica tool' },
        scarica_tool: { toolName: 'scarica_tool', description: 'Scarica tool' },
        cerca_concetti: { toolName: 'cerca_concetti', description: 'Cerca concetti' },
        carica_concetto: { toolName: 'carica_concetto', description: 'Carica concetto' },
        scarica_concetto: { toolName: 'scarica_concetto', description: 'Scarica concetto' }
      }
    };

    /**
     * ========================================================================
     * ISTANZIAZIONE FORMALE DEL FRAMEWORK (Livello 1)
     * ========================================================================
     */
    const config: FrameworkConfig = {
      cognitiveTools: myCognitiveTools,
      systemFrameProjector: mySystemFrameProjector,
      policy: myPolicy
    };

    const framework = new FrameworkEngine(config);

    // Verifiche formali:
    expect(framework).toBeInstanceOf(FrameworkEngine);
    expect(typeof framework.bindWorld).toBe('function');

    // Verifica che tutte le 10 chiavi canoniche siano presenti
    const requiredKeys = [
      'aggiorna_missione',
      'imposta_dato',
      'elimina_dato',
      'compatta_memoria',
      'cerca_tool',
      'carica_tool',
      'scarica_tool',
      'cerca_concetti',
      'carica_concetto',
      'scarica_concetto'
    ];
    for (const key of requiredKeys) {
      expect(config.cognitiveTools[key]).toBeDefined();
    }
  });

  it('dovrebbe segnalare errore di tipo a compilazione se viene omessa anche una sola primitiva canonica', () => {
    // @ts-expect-error - TypeScript rifiuta l'oggetto perché mancano 9 delle 10 primitive canoniche
    const incompleteToolkit: CognitiveToolkit = {
      aggiorna_missione: {
        id: 'aggiorna_missione',
        description: 'Test incompleto',
        parameters: AggiornaMissioneSchema,
        execute: () => 'ok'
      }
    };

    expect(incompleteToolkit.aggiorna_missione).toBeDefined();
  });

  it('dovrebbe garantire forte tipizzazione su A_int rifiutando nomi di azioni cognitive non canoniche', () => {
    // Definizione valida con array o set di CanonicalCognitiveActionId
    const validManifest: AgentManifest = {
      I: 'Test',
      Ms0: 'Test',
      A_int: ['aggiorna_missione', 'carica_tool'],
      A_term: []
    };
    expect(validManifest.A_int).toHaveLength(2);

    const invalidManifest: AgentManifest = {
      I: 'Test',
      Ms0: 'Test',
      // @ts-expect-error - TypeScript rifiuta l'azione 'azione_inesistente' che non appartiene a CanonicalCognitiveActionId
      A_int: ['aggiorna_missione', 'azione_inesistente'],
      A_term: []
    };
    expect(invalidManifest.I).toBe('Test');
  });
});
