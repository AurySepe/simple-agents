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
 * 4. IL MESSAGGIO ATOMICO DEL FLUSSO: e = <index, π, κ, μ, callId?>
 * ============================================================================
 * - index: indice progressivo ordinato della cronologia (0, 1, 2, ...)
 * - role: autorità formale del mittente (user, orchestrator, agent, world)
 * - channel: tipo di messaggio (payload, directive, thought, call, result, summary)
 * - content: payload semantico o testo
 * - callId: identificatore di pairing causale (solo per 'call' e 'result')
 * - tau: metadato interno di telemetria dell'automa Ω (non inviato al modello)
 */
export interface Message {
  index: number;
  role: Role;
  channel: Channel;
  content: unknown;
  callId?: string;
  tau?: TimeIndex;
}

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
export interface WorldTool<TIn = any, TOut = any> extends ToolDefinition<TIn> {
  execute: (args: TIn) => Promise<TOut> | TOut;
}

/**
 * Tool Cognitivo di Introspezione (A_int):
 * Ha facoltà e mandato di applicare transizioni di memoria sullo stato S dell'agente.
 */
export interface CognitiveTool<TIn = any, TOut = any> extends ToolDefinition<TIn> {
  execute: (args: TIn, state: AgentState) => Promise<TOut> | TOut;
}

/**
 * ============================================================================
 * AZIONI COGNITIVE CANONICHE DELL'UNIVERSO INTROSPETTIVO (A_int_universal)
 * ============================================================================
 * Insieme chiuso delle 10 primitive mentali formalizzate nel Framework.
 */
export type CanonicalCognitiveActionId =
  | 'aggiorna_missione'
  | 'imposta_dato'
  | 'elimina_dato'
  | 'compatta_memoria'
  | 'cerca_tool'
  | 'carica_tool'
  | 'scarica_tool'
  | 'cerca_concetti'
  | 'carica_concetto'
  | 'scarica_concetto';

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
export type CognitiveToolkit = Record<CanonicalCognitiveActionId, CognitiveTool> &
  Record<string, CognitiveTool>;

/**
 * ============================================================================
 * TIPOLOGIE DI ERRORI DI PROTOCOLLO E SCHEMA DELL'AUTOMA Ω
 * ============================================================================
 */
export type SchemaErrorKind =
  | 'no_action_in_intro'
  | 'xor_concludi_violation'
  | 'unauthorized_cognitive_action'
  | 'unregistered_cognitive_action'
  | 'no_call_in_exec'
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
  Ds: Record<string, unknown>;         // Dati strutturati di contesto
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
}

export type Directive =
  | StartIntroDirective
  | LoopIntroDirective
  | StartExecDirective
  | ErrSchemaDirective;

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
export interface ToolCall {
  id: string;
  name: string;
  payload: Record<string, unknown>;
}

export interface ModelOutput {
  thought?: string;
  calls: ToolCall[];
}

/**
 * ============================================================================
 * 11. I CONTRATTI DI TERMINAZIONE: A_term e TAGGED UNION
 * ============================================================================
 */
export interface TerminationContract<T = any> {
  id: string;
  description: string;                // Descrizione esplicita fornita dall'utente nel Manifesto
  schema: z.ZodType<T>;
}

export interface ExitResult<T = any> {
  type: string;                        // ID del contratto a_term invocato
  payload: T;                          // Dati tipizzati conformi a σ
}

/**
 * ============================================================================
 * 12. IL MANIFESTO DELL'AGENTE: M_agent = <S0, A_int, A_term>
 * ============================================================================
 */
export interface AgentManifest<TCognitive extends string = CanonicalCognitiveActionId> {
  I: string;
  Ms0: string;
  Ds0?: Record<string, unknown>;
  Ta0?: Set<string> | readonly string[];                   // Sottoinsieme rigoroso di tool montati all'avvio: Ta0 ⊆ W
  Ka0?: Set<Concept> | readonly Concept[];                 // Sottoinsieme rigoroso di concetti pre-caricati: Ka0 ⊆ U_knowledge
  Ep0?: Message[];
  A_int: Set<TCognitive> | readonly TCognitive[];          // Capacità cognitive concesse (se vuoto => reattivo), tipizzate canonicamente
  A_term: TerminationContract[];                           // Porte di uscita tipizzate
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


