import { createCognitiveSchemas } from '../../engine/introspective-universe.js';
import {
  CanonicalCognitiveActionId,
  CognitiveMetadataMap,
  CognitiveTool,
  CognitiveToolkit,
  CognitiveValidationMessages
} from '../../types/index.js';
import { inMemoryCognitiveHandlers } from './handlers.js';

export * from './handlers.js';

export interface DefaultCognitiveToolkitOptions {
  overrides?: Partial<CognitiveToolkit>;
  validationMessages?: Partial<CognitiveValidationMessages>;
  metadata?: Partial<CognitiveMetadataMap>;
}

/**
 * Assembla il CognitiveToolkit combinando gli handler in-memory riutilizzabili
 * con gli schemi di validazione parametrici.
 */
export function createDefaultCognitiveToolkit(
  options?: DefaultCognitiveToolkitOptions
): CognitiveToolkit {
  const schemas = createCognitiveSchemas(options?.validationMessages);
  const handlers = inMemoryCognitiveHandlers;

  const defaultTool = (
    id: CanonicalCognitiveActionId,
    parameters: any,
    defaultDesc: string
  ): CognitiveTool => ({
    id,
    description: options?.metadata?.[id]?.description ?? defaultDesc,
    parameters,
    execute: (args, state) => handlers[id](args, state)
  });

  return {
    aggiorna_missione: defaultTool(
      'aggiorna_missione',
      schemas.AggiornaMissioneSchema,
      "Modifica esplicitamente l'obiettivo a breve termine dell'agente (Ms)."
    ),
    imposta_dato: defaultTool(
      'imposta_dato',
      schemas.ImpostaDatoSchema,
      'Inserisce o aggiorna una variabile di contesto nella memoria di lavoro strutturata (Ds).'
    ),
    elimina_dato: defaultTool(
      'elimina_dato',
      schemas.EliminaDatoSchema,
      'Rimuove una chiave non più utile dalla memoria di lavoro strutturata (Ds).'
    ),
    compatta_memoria: defaultTool(
      'compatta_memoria',
      schemas.CompattaMemoriaSchema,
      'Sintetizza una sotto-sequenza di messaggi in Ep [start_idx, end_idx] sostituendoli con un unico riassunto causale.'
    ),
    cerca_tool: defaultTool(
      'cerca_tool',
      schemas.CercaToolSchema,
      'Ispezione passiva del catalogo strumenti del Mondo.'
    ),
    carica_tool: defaultTool(
      'carica_tool',
      schemas.CaricaToolSchema,
      'Monta attivamente uno o più strumenti nel toolbelt operativo (Ta).'
    ),
    scarica_tool: defaultTool(
      'scarica_tool',
      schemas.ScaricaToolSchema,
      'Smonta uno o più strumenti dal toolbelt operativo (Ta).'
    ),
    cerca_concetti: defaultTool(
      'cerca_concetti',
      schemas.CercaConcettiSchema,
      'Ispezione passiva dell archivio concetti semantici (Knowledge base).'
    ),
    carica_concetto: defaultTool(
      'carica_concetto',
      schemas.CaricaConcettoSchema,
      'Carica uno o più concetti a piena consapevolezza nel buffer attivo Ka.'
    ),
    scarica_concetto: defaultTool(
      'scarica_concetto',
      schemas.ScaricaConcettoSchema,
      'Evacua concetti non più rilevanti dal buffer attivo Ka.'
    ),
    ...options?.overrides
  };
}
