import { z } from 'zod';
import {
  AgentState,
  CognitiveTool,
  CognitiveValidationMessages,
  DataRecord,
  DataValue,
  Scalar,
  ToolDefinition,
  ToolResult
} from '../types/index.js';

export type { CognitiveTool };

/**
 * ============================================================================
 * SCHEMI DI VALIDAZIONE PER L'ALBERO DISCRETO DEI DATI
 * ============================================================================
 */
export const scalarSchema: z.ZodType<Scalar> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
]);

export const dataValueSchema: z.ZodType<DataValue> = z.lazy(() =>
  z.union([
    scalarSchema,
    z.array(dataValueSchema),
    z.record(z.string(), dataValueSchema)
  ])
);

export const dataRecordSchema: z.ZodType<DataRecord> = z.record(z.string(), dataValueSchema);

/**
 * ============================================================================
 * FACTORY DEGLI SCHEMI DEI PARAMETRI DELLE PRIMITIVE COGNITIVE (σ_in)
 * ============================================================================
 * Tutti gli schemi sono puri e parametrizzabili: i messaggi di errore inviati
 * all'LLM durante la fase q_repair sono iniettati dalla policy di Livello 1.
 */

export function createAggiornaMissioneSchema(message?: string) {
  return z.object({
    nuovo_scopo: z.string().min(1, message)
  });
}

export function createImpostaDatoSchema(message?: string) {
  return z.object({
    chiave: z.string().min(1, message),
    valore: dataValueSchema
  });
}

export function createEliminaDatoSchema(message?: string) {
  return z.object({
    chiave: z.string().min(1, message)
  });
}

export function createCercaToolSchema(message?: string) {
  return z.object({
    query: z.string().min(1, message)
  });
}

export function createCaricaToolSchema(message?: string) {
  return z.object({
    tool_ids: z.array(z.string()).min(1, message)
  });
}

export function createScaricaToolSchema(message?: string) {
  return z.object({
    tool_ids: z.array(z.string()).min(1, message)
  });
}

export function createCercaConcettiSchema(message?: string) {
  return z.object({
    query: z.string().min(1, message)
  });
}

export function createCaricaConcettoSchema(message?: string) {
  return z.object({
    concetto_ids: z.array(z.string()).min(1, message)
  });
}

export function createScaricaConcettoSchema(message?: string) {
  return z.object({
    concetto_ids: z.array(z.string()).min(1, message)
  });
}

export function createCompattaMemoriaSchema(messages?: {
  sintesi?: string;
}) {
  return z.object({
    start_idx: z.number().int().nonnegative(),
    end_idx: z.number().int().nonnegative(),
    sintesi: z.string().min(1, messages?.sintesi)
  });
}

/**
 * Genera l'intero set di schemi cognitivi configurati con i messaggi di validazione della policy.
 */
export function createCognitiveSchemas(messages?: Partial<CognitiveValidationMessages>) {
  return {
    AggiornaMissioneSchema: createAggiornaMissioneSchema(messages?.nuovo_scopo_required),
    ImpostaDatoSchema: createImpostaDatoSchema(messages?.chiave_required),
    EliminaDatoSchema: createEliminaDatoSchema(messages?.chiave_required),
    CercaToolSchema: createCercaToolSchema(messages?.query_required),
    CaricaToolSchema: createCaricaToolSchema(messages?.tool_ids_required),
    ScaricaToolSchema: createScaricaToolSchema(messages?.tool_ids_required),
    CercaConcettiSchema: createCercaConcettiSchema(messages?.query_required),
    CaricaConcettoSchema: createCaricaConcettoSchema(messages?.concetto_ids_required),
    ScaricaConcettoSchema: createScaricaConcettoSchema(messages?.concetto_ids_required),
    CompattaMemoriaSchema: createCompattaMemoriaSchema({ sintesi: messages?.sintesi_required })
  };
}

/** Schemi strutturali di base senza messaggi custom (utili per tipizzazioni pure) */
export const AggiornaMissioneSchema = createAggiornaMissioneSchema();
export const ImpostaDatoSchema = createImpostaDatoSchema();
export const EliminaDatoSchema = createEliminaDatoSchema();
export const CercaToolSchema = createCercaToolSchema();
export const CaricaToolSchema = createCaricaToolSchema();
export const ScaricaToolSchema = createScaricaToolSchema();
export const CercaConcettiSchema = createCercaConcettiSchema();
export const CaricaConcettoSchema = createCaricaConcettoSchema();
export const ScaricaConcettoSchema = createScaricaConcettoSchema();
export const CompattaMemoriaSchema = createCompattaMemoriaSchema();

export const EmptyControlSchema = z.object({});

/**
 * ============================================================================
 * AZIONI SPECIALI DI CONTROLLO ATOMICHE DI Ω (Iniettate tramite Policy)
 * ============================================================================
 */
export function createControlActions(
  formatDescription: (action: 'a_concludi_intro' | 'a_abort_call') => string
): Record<'a_concludi_intro' | 'a_abort_call', ToolDefinition> {
  return {
    a_concludi_intro: {
      id: 'a_concludi_intro',
      description: formatDescription('a_concludi_intro'),
      parameters: EmptyControlSchema
    },
    a_abort_call: {
      id: 'a_abort_call',
      description: formatDescription('a_abort_call'),
      parameters: EmptyControlSchema
    }
  };
}

/**
 * ============================================================================
 * ESITO DI ESECUZIONE COGNITIVA: Discriminated Union
 * ============================================================================
 */
export type CognitiveExecutionResult =
  | { success: true; result: ToolResult }
  | { success: false; errorDetail: string };

/**
 * ============================================================================
 * ESECUTORE GENERALE COGNITIVO DI Ω (Polimorfico, Zero Switch-Case)
 * ============================================================================
 * Valida i parametri rispetto allo schema σ_in del tool ed esegue il metodo
 * execute associato, preservando l'invariante di identità.
 */
export async function executeCognitiveTool(
  tool: CognitiveTool,
  rawPayload: DataRecord,
  state: AgentState
): Promise<CognitiveExecutionResult> {
  // 1. Validazione Formale di Tipo: payload ⊨ σ_in
  const parsed = tool.parameters.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      success: false,
      errorDetail: JSON.stringify(parsed.error.format())
    };
  }

  // 2. Esecuzione polimorfica diretta del gestore
  const result = await tool.execute(parsed.data, state);
  return { success: true, result };
}
