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
  targetRepairToolId?: string
): ToolDefinition[] {
  const abortCallDef: ToolDefinition = {
    id: 'a_abort_call',
    description: 'Annulla la chiamata non valida e riprende la deliberazione ordinaria.',
    parameters: EmptyControlSchema
  };

  switch (controlState) {
    case 'q_exec': {
      const visible: ToolDefinition[] = [];

      // 1. Tool fisici montati nel toolbelt Ta
      for (const toolId of state.Ta) {
        const def = world.getToolDefinition(toolId);
        if (def) visible.push(def);
      }

      // 2. Contratti di terminazione tipizzati A_term
      for (const termContract of manifest.A_term) {
        visible.push({
          id: termContract.id,
          description: termContract.description,
          parameters: termContract.schema
        });
      }

      return visible;
    }

    case 'q_repair': {
      const visible: ToolDefinition[] = [];

      // Isolamento: visibile solo il tool target da correggere
      if (targetRepairToolId) {
        // Cerca prima tra i tool del mondo
        const worldDef = world.getToolDefinition(targetRepairToolId);
        if (worldDef) {
          visible.push(worldDef);
        } else {
          // Oppure tra i contratti di terminazione
          const termDef = manifest.A_term.find((t) => t.id === targetRepairToolId);
          if (termDef) {
            visible.push({
              id: termDef.id,
              description: termDef.description,
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
