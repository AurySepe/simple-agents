import { z } from 'zod';
import {
  AgentManifest,
  AgentState,
  FSMControlState,
  ToolDefinition
} from '../types/index.js';
import { WorldRegistry } from '../world/index.js';

export const EmptyControlSchema = z.object({});

/**
 * Opzioni di configurazione per il calcolo della maschera di visibilità dei tool.
 */
export interface VisibleToolsOptions {
  /**
   * Tool target isolato in fase di riparazione (q_repair).
   */
  targetRepairToolId?: string;
  /**
   * Formattatore personalizzato per la descrizione dei contratti di terminazione (A_term).
   * Consente all'utente di definire come segnalare al modello che l'azione è un'azione terminale.
   * Se omesso, usa il default '[AZIONE DI TERMINAZIONE]: <descrizione>'.
   * Se restituisce la descrizione invariata, nessuna marcatura viene applicata.
   */
  formatTerminationDescription?: (id: string, description: string) => string;
  /**
   * Formattatore personalizzato per accodare la specifica dello schema di ritorno (returns)
   * alla descrizione del tool fisico esposta all'LLM.
   * Se omesso, usa il default che appende '[VALORE DI RITORNO]: { ... }'.
   */
  formatToolReturnDescription?: (
    id: string,
    description: string,
    returnsSchema: z.ZodType
  ) => string;
}

export function defaultFormatTerminationDescription(_id: string, description: string): string {
  return `[AZIONE DI TERMINAZIONE]: ${description}`;
}

/**
 * Genera una sintetica rappresentazione strutturata dei tipi di un schema Zod.
 */
export function describeZodSchema(schema: z.ZodType): string {
  if (
    schema instanceof z.ZodObject ||
    ('shape' in schema && typeof (schema as any).shape === 'object')
  ) {
    const shape = (schema as any).shape;
    const entries = Object.entries(shape).map(([k, v]: [string, any]) => {
      let typeName = 'any';
      if (v instanceof z.ZodString) typeName = 'string';
      else if (v instanceof z.ZodNumber) typeName = 'number';
      else if (v instanceof z.ZodBoolean) typeName = 'boolean';
      else if (v instanceof z.ZodArray) typeName = 'array';
      else if (v instanceof z.ZodEnum) typeName = v.options.join(' | ');
      else if (v?._def?.typeName) typeName = v._def.typeName.replace('Zod', '').toLowerCase();

      const desc = v.description ? ` (${v.description})` : '';
      return `${k}: ${typeName}${desc}`;
    });
    return `{ ${entries.join(', ')} }`;
  }

  try {
    const json = z.toJSONSchema(schema, { target: 'openapi-3.0' });
    return JSON.stringify(json);
  } catch {
    return 'object';
  }
}

export function defaultFormatToolReturnDescription(
  _id: string,
  description: string,
  returnsSchema: z.ZodType
): string {
  const returnSummary = describeZodSchema(returnsSchema);
  return `${description}\n[VALORE DI RITORNO]: ${returnSummary}`;
}

/**
 * ============================================================================
 * 1. LA FUNZIONE DI VISIBILITÀ DELLE AZIONI: V_Ω(q)
 * ============================================================================
 * Mappa lo stato corrente dell'automa FSM nel sottoinsieme esatto
 * di tool autorizzati che il modello linguistico può visualizzare ed emettere:
 * - In q_exec: tool fisici montati (Ta) ∪ contratti terminali (A_term)
 * - In q_repair: { a_target, a_abort_call }
 * - Altrimenti: ∅
 */
export function computeVisibleTools(
  controlState: FSMControlState,
  state: AgentState,
  manifest: AgentManifest,
  world: WorldRegistry,
  optionsOrTargetRepairToolId?: string | VisibleToolsOptions
): ToolDefinition[] {
  const options: VisibleToolsOptions =
    typeof optionsOrTargetRepairToolId === 'string'
      ? { targetRepairToolId: optionsOrTargetRepairToolId }
      : (optionsOrTargetRepairToolId ?? {});

  const formatTermDesc =
    options.formatTerminationDescription ?? defaultFormatTerminationDescription;

  const formatReturnDesc =
    options.formatToolReturnDescription ?? defaultFormatToolReturnDescription;

  const abortCallDef: ToolDefinition = {
    kind: 'control',
    id: 'a_abort_call',
    description: 'Annulla la chiamata non valida e riprende la deliberazione ordinaria.',
    parameters: EmptyControlSchema
  };

  switch (controlState) {
    case 'q_exec': {
      const visible: ToolDefinition[] = [];

      // 1. Tool fisici montati nel toolbelt Ta (arricchiti con schema di ritorno se presente)
      for (const toolId of state.Ta) {
        const def = world.getToolDefinition(toolId);
        if (def) {
          const description = def.returns
            ? formatReturnDesc(def.id, def.description, def.returns)
            : def.description;

          visible.push({
            kind: 'world',
            id: def.id,
            description,
            parameters: def.parameters,
            returns: def.returns
          });
        }
      }

      // 2. Contratti di terminazione tipizzati A_term (con formattazione personalizzabile)
      for (const termContract of manifest.A_term) {
        visible.push({
          kind: 'termination',
          id: termContract.id,
          description: formatTermDesc(termContract.id, termContract.description),
          parameters: termContract.schema
        });
      }

      return visible;
    }

    case 'q_repair': {
      const visible: ToolDefinition[] = [];
      const targetToolId = options.targetRepairToolId;

      // Isolamento: visibile solo il tool target da correggere
      if (targetToolId) {
        // Cerca prima tra i tool del mondo
        const worldDef = world.getToolDefinition(targetToolId);
        if (worldDef) {
          const description = worldDef.returns
            ? formatReturnDesc(worldDef.id, worldDef.description, worldDef.returns)
            : worldDef.description;

          visible.push({
            kind: 'world',
            id: worldDef.id,
            description,
            parameters: worldDef.parameters,
            returns: worldDef.returns
          });
        } else {
          // Oppure tra i contratti di terminazione
          const termDef = manifest.A_term.find((t) => t.id === targetToolId);
          if (termDef) {
            visible.push({
              kind: 'termination',
              id: termDef.id,
              description: formatTermDesc(termDef.id, termDef.description),
              parameters: termDef.schema
            });
          }
        }
      }

      // Azione speciale atomica di abort
      visible.push(abortCallDef);
      return visible;
    }

    case 'q_sleep':
    case 'q_yield':
    case 'q_halt':
    default:
      return [];
  }
}

/**
 * ============================================================================
 * 2. LA FUNZIONE DI PROIEZIONE DEL FRAME DI STATO: F_Ω(S)
 * ============================================================================
 * Proietta puramente <I, Ms, Ds, Ka> nel canale di sistema,
 * senza dipendere da direttive procedurali forzate.
 */
export interface SystemFrameProjector {
  renderFrame(state: AgentState): string;
}
