import { z } from 'zod';

/**
 * ============================================================================
 * 1. SPAZIO TEMPORALE A DUE DIMENSIONI: τ = <c, t>
 * ============================================================================
 * - c: Macro-Ciclo del Mondo (quanti cicli completi con W sono terminati)
 * - t: Tick Decisionale (quante inferenze / attivazioni del modello sono avvenute)
 */
export interface TimeIndex {
  c: number;
  t: number;
}

/**
 * ============================================================================
 * 2. SPAZIO DISCRETO DEI DATI
 * ============================================================================
 * Struttura algebrica pura per lo stato strutturato (D_s), i payload esogeni
 * e i risultati di esecuzione dei tool.
 */
export type Scalar = string | number | boolean | null;

export type NonEmptyArray<T> = [T, ...T[]];


/**
 * ============================================================================
 * 2.1 SORGENTI E MODALITÀ FILE / MULTIMODALI
 * ============================================================================
 */
export type FileSource =
  | { kind: 'inline'; data: string; mimeType: string }
  | { kind: 'path'; filePath: string; mimeType?: string }
  | { kind: 'url'; url: string; mimeType?: string }
  | { kind: 'reference'; fileId: string; provider?: string };

export type FileModality = 'image' | 'document' | 'audio' | 'video' | 'text_file';

export interface InputMediaAsset {
  modality: FileModality;
  source: FileSource;
  filename?: string;
  description?: string;
}

export type InterleavedBlock =
  | { type: 'text'; text: string }
  | { type: 'media'; media: InputMediaAsset };

/**
 * ============================================================================
 * 2.2 ONTOLOGIA DELL'INPUT UTENTE (4 COMBINAZIONI ESAUSTIVE NON VUOTE)
 * ============================================================================
 */
export type UserMessageContent =
  | { kind: 'text'; text: string }
  | { kind: 'media'; files: NonEmptyArray<InputMediaAsset> }
  | { kind: 'text_with_media'; text: string; files: NonEmptyArray<InputMediaAsset> }
  | { kind: 'interleaved'; blocks: NonEmptyArray<InterleavedBlock> };

export type UserPayload = UserMessageContent;

export type DataValue =
  | Scalar
  | DataValue[]
  | { [key: string]: DataValue };

export type DataRecord = { [key: string]: DataValue };

export type ToolResult = DataValue | void | undefined;

/**
 * ============================================================================
 * 3. STRUTTURA ATOMICA DEGLI EVENTI EPISTEMICI: e = <τ, type, μ, id>
 * ============================================================================
 * T_event = { 'stimulus', 'thought', 'action', 'result' }
 */
export type EventType = 'stimulus' | 'thought' | 'action' | 'result';

export interface StimulusEvent {
  type: 'stimulus';
  content: UserPayload;
  callId?: never;
}

export interface ThoughtEvent {
  type: 'thought';
  content: string;
  callId?: never;
}

export interface ActionEvent {
  type: 'action';
  callId: string;
  content: {
    name: string;
    payload: DataRecord;
  };
}

export interface EpCoordinates {
  index: number;
  tau?: TimeIndex;
}

export type DiagnosticErrorCode =
  | 'SCHEMA_VALIDATION_ERROR'
  | 'SYNTAX_ERROR'
  | 'UNMOUNTED_TOOL'
  | 'UNKNOWN_ACTION';

export type DiagnosticErrorPayload = {
  status: 'error';
  code: DiagnosticErrorCode;
  message: string;
  details?: Record<string, unknown> | { rawText: string; detail: string } | { toolId: string };
};

export interface ResultEvent {
  type: 'result';
  callId: string;
  content: ToolResult | DiagnosticErrorPayload;
}

export type EpEventInput =
  | StimulusEvent
  | ThoughtEvent
  | ActionEvent
  | ResultEvent;

export type EpEvent =
  | (StimulusEvent & EpCoordinates)
  | (ThoughtEvent & EpCoordinates)
  | (ActionEvent & EpCoordinates)
  | (ResultEvent & EpCoordinates);

// Alias per compatibilità con il flusso di traccia
export type Message = EpEvent;
export type MessageInput = EpEventInput;

export function createEpEvent(input: MessageInput, index: number, tau: TimeIndex): Message {
  const base: EpCoordinates = { index, tau };
  switch (input.type) {
    case 'stimulus':
      return { ...base, type: 'stimulus', content: input.content };
    case 'thought':
      return { ...base, type: 'thought', content: input.content };
    case 'action':
      return { ...base, type: 'action', callId: input.callId, content: input.content };
    case 'result':
      return { ...base, type: 'result', callId: input.callId, content: input.content };
  }
}

/**
 * ============================================================================
 * 4. ONTOLOGIA DI UN CONCETTO: c = <id, descrizione, corpo>
 * ============================================================================
 */
export interface Concept {
  name: string;
  descrizione: string;
  corpo: string;
}

/**
 * ============================================================================
 * 5. DEFINIZIONE DEI TOOL FISICI DEL MONDO (W)
 * ============================================================================
 */
/**
 * ============================================================================
 * 5. DEFINIZIONE DEI TOOL VISIBILI (V_Ω) TRAMITE DISCRIMINATED UNION
 * ============================================================================
 * I tool visibili al modello possono appartenere a tre categorie disgiunte:
 * - 'world': Tool fisici operativi del Mondo (W) montati nel toolbelt Ta.
 * - 'termination': Contratti terminali irreversibili dell'agente (A_term).
 * - 'control': Tool interni di controllo e ripristino dell'automa (es. a_abort_call).
 */
export interface WorldToolDefinition<TIn = any, TOut = any> {
  kind: 'world';
  id: string;
  description: string;
  parameters: z.ZodType<TIn>;
  returns?: z.ZodType<TOut>;
}

export interface TerminationToolDefinition<TIn = any> {
  kind: 'termination';
  id: string;
  description: string;
  parameters: z.ZodType<TIn>;
}

export interface ControlToolDefinition {
  kind: 'control';
  id: string;
  description: string;
  parameters: z.ZodType<any>;
}

export type ToolDefinition<TIn = any, TOut = any> =
  | WorldToolDefinition<TIn, TOut>
  | TerminationToolDefinition<TIn>
  | ControlToolDefinition;

export interface WorldTool<TIn = any, TOut = any> {
  kind?: 'world';
  id: string;
  description: string;
  parameters: z.ZodType<TIn>;
  returns?: z.ZodType<TOut>;
  execute: (args: TIn) => Promise<TOut> | TOut;
}

/**
 * Helper factory per definire un tool di Mondo con inferenza statica rigida di input e output.
 * Il compilatore TypeScript verifica che l'implementazione 'execute' accetti esattamente
 * i tipi dedotti dallo schema 'parameters' e restituisca esattamente i tipi dedotti da 'returns'.
 */
export function defineWorldTool<
  TIn,
  TOut extends ToolResult,
  TInSchema extends z.ZodType<TIn> = z.ZodType<TIn>,
  TOutSchema extends z.ZodType<TOut> = z.ZodType<TOut>
>(tool: {
  id: string;
  description: string;
  parameters: TInSchema;
  returns?: TOutSchema;
  execute: (args: z.infer<TInSchema>) => Promise<z.infer<TOutSchema>> | z.infer<TOutSchema>;
}): WorldTool<z.infer<TInSchema>, z.infer<TOutSchema>> {
  return tool as WorldTool<z.infer<TInSchema>, z.infer<TOutSchema>>;
}

/**
 * Type guards rigorosi
 */
export function isDataRecord(val: unknown): val is DataRecord {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isDataValue(val: unknown): val is DataValue {
  if (val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return true;
  }
  if (Array.isArray(val)) {
    return val.every(isDataValue);
  }
  if (typeof val === 'object') {
    return Object.values(val).every(isDataValue);
  }
  return false;
}

export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

export function isUserMessageContent(val: unknown): val is UserMessageContent {
  if (typeof val !== 'object' || val === null) {
    return false;
  }
  const obj = val as Record<string, unknown>;
  if (obj.kind === 'text') {
    return typeof obj.text === 'string';
  }
  if (obj.kind === 'media') {
    return Array.isArray(obj.files) && obj.files.length > 0;
  }
  if (obj.kind === 'text_with_media') {
    return typeof obj.text === 'string' && Array.isArray(obj.files) && obj.files.length > 0;
  }
  if (obj.kind === 'interleaved') {
    return Array.isArray(obj.blocks) && obj.blocks.length > 0;
  }
  return false;
}

/**
 * ============================================================================
 * 6. LO STATO GLOBALE DELL'AGENTE: S = <I, Ms, Ds, Ta, Ka, Ep>
 * ============================================================================
 */
export interface AgentState {
  I: string;                           // Identità assoluta immutabile
  Ms: string;                          // Missione corrente
  Ds: DataRecord;                      // Mappa dei dati operativi strutturati
  Ta: Set<string>;                     // Toolbelt attivo (ID dei tool montati da W)
  Ka: Map<string, Concept>;            // Buffer concetti attivi a testo pieno
  Ep: Message[];                       // Traccia episodica degli eventi
}

/**
 * ============================================================================
 * 6.b STATO SERIALIZZATO DELL'AGENTE (JSON Puro)
 * ============================================================================
 * Rappresentazione algebrica dello stato S interamente compatibile con JSON.stringify
 * e trasmissibile attraverso canali di I/O, database o code di messaggi.
 * Sostituisce Set<string> con string[] e Map<string, Concept> con Concept[].
 */
export interface SerializedAgentState<
  TTools = Record<string, unknown>,
  TState = DataRecord
> {
  I: string;
  Ms: string;
  Ds: TState;
  Ta: (keyof TTools & string)[];
  Ka: Concept[];
  Ep: Message[];
}

/**
 * Serializza l'AgentState di runtime in un oggetto SerializedAgentState JSON-safe.
 */
export function serializeAgentState<
  TTools = Record<string, unknown>,
  TState extends DataRecord = DataRecord
>(state: AgentState): SerializedAgentState<TTools, TState> {
  return {
    I: state.I,
    Ms: state.Ms,
    Ds: { ...state.Ds } as TState,
    Ta: Array.from(state.Ta) as (keyof TTools & string)[],
    Ka: Array.from(state.Ka.values()),
    Ep: state.Ep.map((msg) => ({ ...msg }))
  };
}

/**
 * Deserializza un SerializedAgentState JSON in un AgentState di runtime con Set e Map.
 */
export function deserializeAgentState(
  serialized: SerializedAgentState<any, any> | AgentState
): AgentState {
  if (serialized.Ta instanceof Set && serialized.Ka instanceof Map) {
    return {
      I: serialized.I,
      Ms: serialized.Ms,
      Ds: { ...serialized.Ds },
      Ta: new Set(serialized.Ta),
      Ka: new Map(serialized.Ka),
      Ep: [...serialized.Ep]
    };
  }
  const kaEntries = Array.isArray(serialized.Ka)
    ? (serialized.Ka as Concept[]).map((c) => [c.name, c] as [string, Concept])
    : [];
  return {
    I: serialized.I,
    Ms: serialized.Ms,
    Ds: { ...serialized.Ds },
    Ta: new Set(serialized.Ta),
    Ka: new Map(kaEntries),
    Ep: (serialized.Ep ?? []).map((msg) => ({ ...msg }))
  };
}

/**
 * ============================================================================
 * 7. LA TRIPLA DI CONTESTO PER L'INFERENZA: C_Ω
 * ============================================================================
 * C_Ω(S, q) = < F_Ω (System), Ep (Messages), V_Ω (Tools) >
 */
export interface InferenceTriple {
  systemFrame: string;                 // F_Ω proiettato per il canale system
  messages: Message[];                 // Ep pulito senza duplicazioni
  visibleTools: ToolDefinition[];      // V_Ω maschera di visibilità
}

/**
 * ============================================================================
 * 8. RISPOSTA DEL MODELLO LINGUISTICO: M(C_Ω)
 * ============================================================================
 */
export interface ValidToolCall {
  status: 'valid';
  id: string;
  name: string;
  payload: DataRecord;
}

export interface SyntaxErrorToolCall {
  status: 'syntax_error';
  id: string;
  name: string;
  rawText: string;
  errorDetail: string;
  payload: DataRecord;
}

export type ToolCall = ValidToolCall | SyntaxErrorToolCall;

export type ToolCallInput =
  | { status?: 'valid'; id: string; name: string; payload: DataRecord }
  | SyntaxErrorToolCall;

export function normalizeToolCall(call: ToolCallInput): ToolCall {
  if (call.status === 'syntax_error') {
    return call;
  }
  return {
    status: 'valid',
    id: call.id,
    name: call.name,
    payload: call.payload
  };
}


/**
 * ============================================================================
 * 8. RISPOSTA DEL MODELLO LINGUISTICO: M(C_Ω)
 * ============================================================================
 */

/**
 * Rappresenta la paralisi deliberativa del modello linguistico
 * dovuta all'esaurimento del budget di token di pensiero (finish_reason='length')
 * prima di riuscire a selezionare un'azione.
 */
export interface DeliberationStall {
  reason: 'thinking_budget_exhausted';
  partialThought: string;
  message: string;
}

/**
 * Metriche di utilizzo computazionale e token dell'inferenza del modello.
 */
export interface ModelUsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  tokensPerSecond?: number;
}

export interface ModelOutput {
  status?: 'success';
  thought?: string;
  calls: NonEmptyArray<ToolCallInput>;
  usage?: ModelUsageMetrics;
}

export interface ModelStallOutput {
  status: 'stall';
  stall: DeliberationStall;
  usage?: ModelUsageMetrics;
}

export type ModelResult = ModelOutput | ModelStallOutput;

export function isModelStall(result: ModelResult): result is ModelStallOutput {
  return result.status === 'stall';
}

/**
 * ============================================================================
 * ERRORI INFRASTRUTTURALI / AMBIENTALI DEL MODELLO
 * ============================================================================
 */
export interface UnexpectedModelError {
  type: 'UNEXPECTED_MODEL_ERROR';
  message: string;
  cause: unknown;
}

export type ModelDeliberateResult<TKnownErrors = never> =
  | { ok: true; data: ModelResult; error?: never }
  | { ok: false; error: TKnownErrors; data?: never }
  | ModelResult;

export function modelOk(data: ModelResult): { ok: true; data: ModelResult; error?: never } {
  return { ok: true, data };
}

export function modelFail<E extends { type: string }>(error: E): { ok: false; error: E; data?: never } {
  return { ok: false, error };
}

/**
 * ============================================================================
 * 8.b INTERFACCIA DEL TRASDUTTORE NEURALE (MODELLO LINGUISTICO): M
 * ============================================================================
 * Il Framework definisce il Modello come una funzione pura di inferenza:
 * M: C_Ω -> Promise<ModelDeliberateResult<TKnownErrors>>
 */
export interface LanguageModelAdapter<TKnownErrors = never> {
  infer(context: InferenceTriple): Promise<ModelDeliberateResult<TKnownErrors>>;
}

/**
 * ============================================================================
 * 9. I CONTRATTI DI TERMINAZIONE: A_term e TAGGED UNION
 * ============================================================================
 */
export interface TerminationContract<T = any> {
  id: string;
  description: string;
  schema: z.ZodType<T>;
}

export interface ExitResult<T = DataValue> {
  type: string;                        // ID del contratto a_term invocato
  payload: T;                          // Dati tipizzati conformi a σ
}

/**
 * ============================================================================
 * 10. LA SPECIFICA DELL'AGENTE: A_op = <I, Ms0, Ds0, Ta0, Ka0, A_term>
 * ============================================================================
 */
export interface AgentManifest<TTerm = DataValue> {
  I: string;
  Ms0: string;
  Ds0?: DataRecord;
  Ta0?: Set<string> | readonly string[];
  Ka0?: Set<Concept> | readonly Concept[];
  Ep0?: Message[];
  A_term: TerminationContract<TTerm>[];
}

/**
 * ============================================================================
 * 11. STATI MACROSCOPICI DI CONTROLLO DELL'AUTOMA: Q
 * ============================================================================
 */
export type FSMControlState =
  | 'q_sleep'
  | 'q_exec'
  | 'q_yield'
  | 'q_repair'
  | 'q_halt'
  | 'q_stall';

export type ActiveFSMState<TTerm = DataValue> =
  | { phase: 'q_sleep' }
  | { phase: 'q_exec' }
  | { phase: 'q_yield'; pendingCalls: ValidToolCall[] }
  | { phase: 'q_repair'; targetToolId: string; targetCallId: string }
  | { phase: 'q_halt'; exitResult: ExitResult<TTerm> }
  | { phase: 'q_stall'; stall: DeliberationStall };

/**
 * ============================================================================
 * 12. CODICI DELLE TRANSIZIONI FSM
 * ============================================================================
 */
export type TransitionReasonCode =
  | 'stimulus_received'
  | 'exec_world_yield'
  | 'exec_term_success'
  | 'exec_schema_error'
  | 'exec_syntax_error'
  | 'repair_success'
  | 'repair_abort'
  | 'post_yield_exec'
  | 'manual_override'
  | 'exec_deliberation_stall';
