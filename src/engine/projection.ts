import {
  AgentManifest,
  AgentState,
  CanonicalCognitiveActionId,
  DataValue,
  Directive,
  isCanonicalCognitiveActionId,
  TerminationContract,
  ToolDefinition
} from '../types/index.js';
import { OrchestratorPolicy } from './orchestrator.js';
import { EmptyControlSchema } from './introspective-universe.js';

/**
 * ============================================================================
 * 1. LA FUNZIONE DI VISIBILITÀ DELLE AZIONI: V_Ω(δ, S)
 * ============================================================================
 * Mappa la direttiva corrente e lo stato dell'agente nel sottoinsieme esatto
 * di tool autorizzati che il modello linguistico può visualizzare ed emettere.
 * Traduce gli identificatori simbolici costanti del Manifesto nei nomi LLM-facing
 * definiti dalla policy di Livello 1.
 */
export function computeVisibleTools(
  directive: Directive,
  state: AgentState,
  manifest: AgentManifest<string, DataValue>,
  availableCognitiveTools: Map<string, ToolDefinition> | Record<string, ToolDefinition>,
  availableWorldTools: Map<string, ToolDefinition>,
  policy: OrchestratorPolicy
): ToolDefinition[] {
  const getCognitiveDef = (id: string): ToolDefinition | undefined =>
    availableCognitiveTools instanceof Map
      ? availableCognitiveTools.get(id)
      : availableCognitiveTools[id];

  const concludiIntroDef: ToolDefinition = {
    id: 'a_concludi_intro',
    description: policy.formatControlActionDescription('a_concludi_intro'),
    parameters: EmptyControlSchema
  };

  const abortCallDef: ToolDefinition = {
    id: 'a_abort_call',
    description: policy.formatControlActionDescription('a_abort_call'),
    parameters: EmptyControlSchema
  };

  switch (directive.type) {
    case 'start_intro':
    case 'resume_intro':
    case 'loop_intro': {
      // Visibili SOLO i tool cognitivi concessi in A_int (tradotti con i metadati della policy)
      // + l'azione atomica di chiusura a_concludi_intro
      const visible: ToolDefinition[] = [];

      for (const canonicalId of manifest.A_int) {
        const def = getCognitiveDef(canonicalId);
        if (def) {
          const meta = isCanonicalCognitiveActionId(canonicalId)
            ? policy.cognitiveMetadata[canonicalId]
            : undefined;
          visible.push({
            id: meta ? meta.toolName : def.id,
            description: meta ? meta.description : def.description,
            parameters: def.parameters
          });
        }
      }

      // Iniezione dinamica della chiusura governata da Ω
      visible.push(concludiIntroDef);
      return visible;
    }

    case 'start_exec': {
      // Visibili SOLO i tool fisici montati nel toolbelt Ta + i contratti di uscita A_term
      const visible: ToolDefinition[] = [];

      // 1. Tool fisici montati
      for (const toolId of state.Ta) {
        const def = availableWorldTools.get(toolId);
        if (def) visible.push(def);
      }

      // 2. Contratti di terminazione tipizzati
      for (const termContract of manifest.A_term) {
        visible.push({
          id: termContract.id,
          description: termContract.description,
          parameters: termContract.schema
        });
      }

      return visible;
    }

    case 'err_schema':
    case 'err_syntax': {
      // Isolamento rigido: visibile SOLO l'azione fallita da riparare + l'azione atomica di aborto
      const visible: ToolDefinition[] = [];

      let targetDef: ToolDefinition | TerminationContract | undefined;

      // Cerca nei cognitivi (con supporto alla traduzione simbolica)
      for (const [canonicalId, meta] of Object.entries(policy.cognitiveMetadata)) {
        if (meta.toolName === directive.targetToolId || canonicalId === directive.targetToolId) {
          const rawDef = getCognitiveDef(canonicalId);
          if (rawDef) {
            targetDef = {
              id: meta.toolName,
              description: meta.description,
              parameters: rawDef.parameters
            };
            break;
          }
        }
      }

      if (!targetDef) {
        const cognitiveRaw = getCognitiveDef(directive.targetToolId);
        if (cognitiveRaw) {
          targetDef = cognitiveRaw;
        } else {
          targetDef =
            availableWorldTools.get(directive.targetToolId) ||
            manifest.A_term.find((t) => t.id === directive.targetToolId);
        }
      }

      if (targetDef) {
        if ('schema' in targetDef) {
          visible.push({
            id: targetDef.id,
            description: targetDef.description,
            parameters: targetDef.schema
          });
        } else {
          visible.push(targetDef);
        }
      }

      // Iniezione dinamica dell'aborto governata da Ω
      visible.push(abortCallDef);
      return visible;
    }
  }
}

/**
 * ============================================================================
 * 2. LA FUNZIONE DI PROIEZIONE DEL FRAME DI STATO: F_Ω(δ, S)
 * ============================================================================
 * Tipo contrattuale puro per la proiezione dello stato nel canale di sistema (system).
 * Il framework impone che sia l'utente a Livello 1 a definire come formattare
 * e proiettare lo stato nel prompt (es. Markdown, XML, JSON, Jinja, ecc.).
 */
export type SystemFrameProjector = (
  directive: Directive,
  state: AgentState,
  policy?: OrchestratorPolicy
) => string;
