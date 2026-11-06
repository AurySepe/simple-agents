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
 * 2. LO SPAZIO DEI RUOLI EPISTEMICI: Π
 * ============================================================================
 * Definisce l'autorità formale della sorgente del messaggio:
 * - orchestrator (π_Ω): massima autorità, genera direttive e risposte cognitive
 * - agent (π_agent): il ragionatore (thought e call)
 * - world (π_world): risultati oggettivi passivi da W
 * - user (π_user): payload esogeni iniziali o asincroni
 */
export type Role = 'orchestrator' | 'agent' | 'world' | 'user';

/**
 * ============================================================================
 * 3. LO SPAZIO DEI CANALI DI CONTENUTO: K
 * ============================================================================
 */
export type Channel = 'thought' | 'call' | 'result' | 'directive' | 'payload' | 'summary';

/**
 * ============================================================================
 * 4. ALBERO DISCRETO DEI DATI E MESSAGGI ATOMICI DEL FLUSSO
 * ============================================================================
 * Struttura algebrica pura per lo stato strutturato (D_s), i payload esogeni
 * e i risultati di esecuzione dei tool, indipendente da specifici formati
 * contingenti di serializzazione (JSON, YAML, CBOR, ecc.).
 */

export type Scalar = string | number | boolean | null;

export type DataValue =
  | Scalar
  | DataValue[]
  | { [key: string]: DataValue };

export type DataRecord = { [key: string]: DataValue };

export type UserPayload = string | DataRecord;

export type ToolResult = DataValue | void | undefined;

export type DirectiveContent = string | DataRecord;

export interface ThoughtMessage {
  role: 'agent';
  channel: 'thought';
  content: string;
  callId?: never;
}

export interface CallMessage {
  role: 'agent';
  channel: 'call';
  callId: string;
  content: {
    name: string;
    payload: DataRecord;
  };
}

export interface ResultMessage {
  role: 'world' | 'orchestrator';
  channel: 'result';
  callId: string;
  content: ToolResult;
}

export interface BaseDirectiveMessage {
  role: 'orchestrator';
  channel: 'directive';
  content: DirectiveContent;
}

export interface OperationalDirectiveMessage extends BaseDirectiveMessage {
  directiveType?: 'start_intro' | 'resume_intro' | 'loop_intro' | 'start_exec';
  callId?: never;
  targetToolId?: never;
  schemaErrorDetail?: never;
}

export interface ErrSchemaDirectiveMessage extends BaseDirectiveMessage {
  directiveType: 'err_schema';
  callId?: string;
  targetToolId: string;
  schemaErrorDetail: string;
}

export interface ErrSyntaxDirectiveMessage extends BaseDirectiveMessage {
  directiveType: 'err_syntax';
  callId?: string;
  targetToolId: string;
  rawText: string;
  syntaxErrorDetail: string;
}

export type DirectiveMessage =
  | OperationalDirectiveMessage
  | ErrSchemaDirectiveMessage
  | ErrSyntaxDirectiveMessage;

export interface PayloadMessage {
  role: 'user';
  channel: 'payload';
  content: UserPayload;
  callId?: never;
}

export interface SummaryMessage {
  role: 'orchestrator' | 'world';
  channel: 'summary';
  content: string;
  callId?: never;
}

export type MessageInput =
  | ThoughtMessage
  | CallMessage
  | ResultMessage
  | DirectiveMessage
  | PayloadMessage
  | SummaryMessage;

export type Message = MessageInput & {
  index: number;
  tau?: TimeIndex;
};

/**
 * ============================================================================
 * 5. ONTOLOGIA DI UN CONCETTO: c = <id, descrizione, corpo>
 * ============================================================================
 */
export interface Concept {
  id: string;
  descrizione: string;
  corpo: string;
}

/**
 * ============================================================================
 * 6. DEFINIZIONE GENERALE DEI TOOL (INTERFACCIA PER IL MODELLO LLM)
 * ============================================================================
 * Rappresenta la firma formale contrattuale esposta nella maschera di visibilità V_Ω.
 */
export interface ToolDefinition<TIn = any> {
  id: string;
  description: string;
  parameters: z.ZodType<TIn>;
}

/**
 * Tool Fisico del Mondo Esterno (W):
 * In ossequio al Teorema di Non-Invasività, opera esclusivamente sui parametri in ingresso
 * e non ha accesso allo stato interno dell'agente.
 */
export interface WorldTool<TIn = any, TOut extends ToolResult = ToolResult> extends ToolDefinition<TIn> {
  execute: (args: TIn) => Promise<TOut> | TOut;
}

/**
 * Tool Cognitivo di Introspezione (A_int):
 * Ha facoltà e mandato di applicare transizioni di memoria sullo stato S dell'agente.
 */
export interface CognitiveTool<TIn = any, TOut extends ToolResult = ToolResult> extends ToolDefinition<TIn> {
  execute: (args: TIn, state: AgentState) => Promise<TOut> | TOut;
}

/**
 * ============================================================================
 * PARAMETRI FORMALI TIPICIZZATI PER LE AZIONI COGNITIVE CANONICHE
 * ============================================================================
 */
export interface CognitiveActionArgsMap {
  aggiorna_missione: { nuovo_scopo: string };
  imposta_dato: { chiave: string; valore: DataValue };
  elimina_dato: { chiave: string };
  compatta_memoria: { start_idx: number; end_idx: number; sintesi: string };
  cerca_tool: { query: string };
  carica_tool: { tool_ids: string[] };
  scarica_tool: { tool_ids: string[] };
  cerca_concetti: { query: string };
  carica_concetto: { concetto_ids: string[] };
  scarica_concetto: { concetto_ids: string[] };
}

/**
 * ============================================================================
 * AZIONI COGNITIVE CANONICHE DELL'UNIVERSO INTROSPETTIVO (A_int_universal)
 * ============================================================================
 * Insieme chiuso delle 10 primitive mentali formalizzate nel Framework.
 */
export const CANONICAL_COGNITIVE_ACTION_IDS = [
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
] as const;

export type CanonicalCognitiveActionId = (typeof CANONICAL_COGNITIVE_ACTION_IDS)[number];

/**
 * Type guards rigorosi
 */
export function isCanonicalCognitiveActionId(id: string): id is CanonicalCognitiveActionId {
  return CANONICAL_COGNITIVE_ACTION_IDS.some((item) => item === id);
}

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

/**
 * ============================================================================
 * METADATI LINGUISTICI ED EPISTEMICI PER IL MODELLO (LLM-Facing)
 * ============================================================================
 * Disaccoppia la costante simbolica interna del codice dal nome e dalla descrizione
 * con cui l'azione viene effettivamente proiettata ed emessa dal modello.
 */
export interface CognitiveActionMetadata {
  toolName: string;    // Il nome visto ed emesso dall'LLM (es. 'update_mission' in inglese, 'aggiorna_missione' in italiano)
  description: string; // La descrizione del tool inviata all'LLM
}

export type CognitiveMetadataMap = Record<CanonicalCognitiveActionId, CognitiveActionMetadata>;

/**
 * Catalogo fortemente tipizzato delle azioni cognitive del Framework (Livello 1).
 * Obbliga a tempo di compilazione a definire tutte le 10 azioni canoniche,
 * consentendo opzionalmente l'aggiunta di ulteriori azioni cognitive personalizzate.
 */
export type CognitiveToolkit = {
  [K in CanonicalCognitiveActionId]: CognitiveTool<CognitiveActionArgsMap[K]>;
} & Record<string, CognitiveTool>;

/**
 * ============================================================================
 * TIPOLOGIE DI ERRORI DI PROTOCOLLO E SCHEMA DELL'AUTOMA Ω
 * ============================================================================
 */
export type SchemaErrorKind =
  | 'xor_concludi_violation'
  | 'unauthorized_cognitive_action'
  | 'unregistered_cognitive_action'
  | 'unmounted_world_tool'
  | 'unregistered_world_tool';

/**
 * ============================================================================
 * MESSAGGI DI VALIDAZIONE DEI PARAMETRI COGNITIVI (Policy-driven)
 * ============================================================================
 * Permette di parametrizzare a Livello 1 i testi esatti con cui Zod guida
 * l'agente nella correzione dei parametri formali durante q_repair.
 */
export interface CognitiveValidationMessages {
  nuovo_scopo_required: string;
  chiave_required: string;
  query_required: string;
  tool_ids_required: string;
  concetto_ids_required: string;
  sintesi_required: string;
  invalid_indices: string;
}

/**
 * ============================================================================
 * 7. LO STATO GLOBALE DELL'AGENTE: S = <I, Ms, Ds, Ta, Ka, Ep>
 * ============================================================================
 */
export interface AgentState {
  I: string;                           // Identità assoluta immutabile
  Ms: string;                          // Missione corrente a breve termine
  Ds: DataRecord;                      // Dati strutturati di contesto
  Ta: Set<string>;                     // Toolbelt attivo (ID dei tool montati in W)
  Ka: Map<string, Concept>;            // Buffer concetti attivi a testo pieno
  Ep: Message[];                       // Flusso di coscienza cronologico
}

/**
 * ============================================================================
 * 8. LE DIRETTIVE DI CONTROLLO: Δ (Discriminated Union Rigorosa)
 * ============================================================================
 */
export interface StartIntroDirective {
  type: 'start_intro';
  prompt: string;
}

export interface ResumeIntroDirective {
  type: 'resume_intro';
  prompt: string;
}

export interface LoopIntroDirective {
  type: 'loop_intro';
  prompt: string;
}

export interface StartExecDirective {
  type: 'start_exec';
  prompt: string;
}

export interface ErrSchemaDirective {
  type: 'err_schema';
  prompt: string;
  targetToolId: string;       // Obbligatorio in caso di errore schema
  schemaErrorDetail: string;  // Obbligatorio in caso di errore schema
  callId?: string;
}

export interface ErrSyntaxDirective {
  type: 'err_syntax';
  prompt: string;
  targetToolId: string;       // Obbligatorio in caso di errore sintassi
  rawText: string;            // Testo non parsabile ricevuto
  syntaxErrorDetail: string;  // Dettaglio dell'errore di sintassi JSON
  callId?: string;
}

export type Directive =
  | StartIntroDirective
  | ResumeIntroDirective
  | LoopIntroDirective
  | StartExecDirective
  | ErrSchemaDirective
  | ErrSyntaxDirective;

export type DirectiveType = Directive['type'];

/**
 * ============================================================================
 * 9. LA TRIPLA DI CONTESTO FONDAMENTALE PER L'INFERENZA: C_Ω
 * ============================================================================
 * C_Ω(δ, S) = < F_Ω (System), Ep (Messages), V_Ω (Tools) >
 */
export interface InferenceTriple {
  systemFrame: string;                 // F_Ω proiettato per il canale system
  messages: Message[];                 // Ep pulito senza duplicazioni
  visibleTools: ToolDefinition[];      // V_Ω maschera di visibilità
}

/**
 * ============================================================================
 * 10. RISPOSTA DUAL DEL MODELLO LINGUISTICO: M(C_Ω)
 * ============================================================================
 */
export interface ValidToolCall {
  status?: 'valid';
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

export type NonEmptyArray<T> = [T, ...T[]];

export interface ModelOutput {
  thought?: string;
  calls: NonEmptyArray<ToolCall>;
}

/**
 * ============================================================================
 * 11. I CONTRATTI DI TERMINAZIONE: A_term e TAGGED UNION
 * ============================================================================
 */
export interface TerminationContract<T = DataValue> {
  id: string;
  description: string;                // Descrizione esplicita fornita dall'utente nel Manifesto
  schema: z.ZodType<T>;
}

export interface ExitResult<T = DataValue> {
  type: string;                        // ID del contratto a_term invocato
  payload: T;                          // Dati tipizzati conformi a σ
}

/**
 * ============================================================================
 * 12. IL MANIFESTO DELL'AGENTE: M_agent = <S0, A_int, A_term>
 * ============================================================================
 */
export interface AgentManifest<
  TCognitive extends string = CanonicalCognitiveActionId,
  TTerm = DataValue
> {
  I: string;
  Ms0: string;
  Ds0?: DataRecord;
  Ta0?: Set<string> | readonly string[];                   // Sottoinsieme rigoroso di tool montati all'avvio: Ta0 ⊆ W
  Ka0?: Set<Concept> | readonly Concept[];                 // Sottoinsieme rigoroso di concetti pre-caricati: Ka0 ⊆ U_knowledge
  Ep0?: Message[];
  A_int: Set<TCognitive> | readonly TCognitive[];          // Capacità cognitive concesse (se vuoto => reattivo), tipizzate canonicamente
  A_term: TerminationContract<TTerm>[];                    // Porte di uscita tipizzate
}

/**
 * ============================================================================
 * 13. STATI MACROSCOPICI DI CONTROLLO DELL'AUTOMA: Q
 * ============================================================================
 */
export type FSMControlState =
  | 'q_sleep'
  | 'q_intro'
  | 'q_exec'
  | 'q_repair'
  | 'q_yield'
  | 'q_halt';

/**
 * ============================================================================
 * 14. CODICI SIMBOLICI DELLE TRANSIZIONI FSM
 * ============================================================================
 * Codici costanti simbolici astratti che identificano la causa di una transizione
 * senza alcuna stringa in linguaggio naturale all'interno del motore Ω.
 */
export type TransitionReasonCode =
  | 'router_initial_intro'
  | 'router_initial_exec'
  | 'intro_concluded'
  | 'intro_empty_action'
  | 'intro_xor_violation'
  | 'intro_unauthorized_action'
  | 'intro_unregistered_action'
  | 'intro_action_execution_error'
  | 'intro_json_syntax_error'
  | 'exec_empty_calls'
  | 'exec_term_schema_error'
  | 'exec_term_success'
  | 'exec_world_unmounted_tool'
  | 'exec_world_schema_error'
  | 'exec_json_syntax_error'
  | 'exec_world_yield'
  | 'repair_abort_success'
  | 'repair_abort_yield'
  | 'repair_retry_intro'
  | 'repair_retry_exec'
  | 'manual_override'
  | 'post_yield_sleep';



