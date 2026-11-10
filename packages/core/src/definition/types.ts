import { z } from 'zod';
import {
  Concept,
  DataRecord,
  DataValue,
  Message,
  ToolResult,
  LanguageModelAdapter,
  AgentManifest,
  AgentState
} from '../types/index.js';
import { FrameworkEngine, AgentInstance, RunOptions, RunResult, StallRunResult, SuspendedRunResult, ErrorRunResult } from '../engine/orchestrator.js';
import { WorldRegistry } from '../world/index.js';
import type { EvaluationCollector } from '../observability/collectors/evaluation-collector.js';
import type { BehavioralTrajectory } from './trajectory-extractor.js';

/**
 * ============================================================================
 * VALIDAZIONE COMPILE-TIME DI DATAVALUE
 * ============================================================================
 * Riconosce i tipi che non possono esistere nello spazio discreto serializzabile dei dati (D).
 * Rifiuta a tempo di compilazione funzioni native, istanze Date, Symbol, BigInt, Map/Set.
 */
export type NonDataValue =
  | Function
  | symbol
  | bigint
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | Promise<unknown>;

export type IsValidDataValue<T> = [T] extends [NonDataValue]
  ? false
  : [T] extends [readonly (infer U)[]]
  ? IsValidDataValue<U>
  : [T] extends [object]
  ? string extends keyof T
    ? true
    : false extends { [K in keyof T]: IsValidDataValue<T[K]> }[keyof T]
    ? false
    : true
  : true;

export type ValidateContractTools<TTools> = {
  [K in keyof TTools]: TTools[K] extends ToolContract<infer TParams, infer TReturns>
    ? IsValidDataValue<z.infer<TParams>> extends false
      ? 'ERRORE_COMPILE_TIME: I parametri del tool contengono tipi non ammessi (funzioni, Date o classi)'
      : IsValidDataValue<z.infer<TReturns>> extends false
      ? 'ERRORE_COMPILE_TIME: Il ritorno del tool contiene tipi non ammessi (funzioni, Date o classi)'
      : TTools[K]
    : TTools[K];
};

export type ValidateContractTerminations<TTerminations> = {
  [K in keyof TTerminations]: TTerminations[K] extends TerminationContractDef<infer TSchema>
    ? IsValidDataValue<z.infer<TSchema>> extends false
      ? 'ERRORE_COMPILE_TIME: Lo schema di terminazione contiene tipi non ammessi (funzioni, Date o classi)'
      : TTerminations[K]
    : TTerminations[K];
};

/**
 * ============================================================================
 * SPECIFICA ASTRATTA DI UN TOOL (Contratto Cognitivo)
 * ============================================================================
 * Definisce la firma tipizzata di un tool autorizzato senza implementazione.
 */
export interface ToolContract<
  TParams extends z.ZodType = z.ZodType,
  TReturns extends z.ZodType = z.ZodType
> {
  description: string;
  parameters: TParams;
  returns?: TReturns;
}

/**
 * ============================================================================
 * SPECIFICA DI UN CONTRATTO DI TERMINAZIONE (A_term)
 * ============================================================================
 */
export interface TerminationContractDef<TPayload extends z.ZodType = z.ZodType> {
  description: string;
  schema: TPayload;
}

/**
 * ============================================================================
 * IL CONTRATTO DELL'AGENTE (Specifica Cognitiva Pura di Livello 3)
 * ============================================================================
 */
export interface AgentContract<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> {
  /** Identità ontologica (I) dell'agente */
  identity: string;
  /** Missione primaria e prompt di sistema (Ms0) */
  mission: string;
  /** Concetti di dominio o regole stabili (Ka0) */
  knowledge?: Concept[];
  /** Schema Zod per i dati strutturati mantenuti nello stato (Ds) */
  stateSchema?: TStateSchema;
  /** Catalogo dei tool che l'agente può invocare (Ta0) */
  tools: TTools;
  /** Insieme dei contratti di terminazione tipizzati (A_term) */
  terminations: TTerminations;
}

/**
 * Calcola l'unione etichettata dei possibili payload di uscita da TTerminations.
 * Consente l'autocompletamento discriminato su outcome.result.type e outcome.result.payload.
 */
export type InferTerminationsUnion<TTerminations extends Record<string, TerminationContractDef>> = {
  [K in keyof TTerminations]: {
    type: K & string;
    payload: TTerminations[K]['schema'] extends z.ZodType
      ? z.infer<TTerminations[K]['schema']>
      : DataValue;
  };
}[keyof TTerminations];

/**
 * Esito dell'esecuzione dell'agente fortemente tipizzato sulle terminazioni dichiarate nel contratto.
 * In caso di halt, outcome.result è un'unione discriminata sulle terminazioni e sui relativi payload Zod.
 */
export type AgentRunResult<TTerminations extends Record<string, TerminationContractDef>> =
  | {
      status: 'halt';
      macroCycles: number;
      ticks: number;
      state: AgentState;
      result: InferTerminationsUnion<TTerminations>;
      stall?: never;
      reason?: never;
      error?: never;
    }
  | StallRunResult
  | SuspendedRunResult
  | ErrorRunResult;

/**
 * ============================================================================
 * ERRORI E RESULT DI PARSING DELLO STATO: StateParseResult
 * ============================================================================
 */
export type StateParseErrorCode =
  | 'NOT_AN_OBJECT'
  | 'INVALID_IDENTITY'
  | 'INVALID_MISSION'
  | 'SCHEMA_VIOLATION'
  | 'UNDECLARED_TOOL'
  | 'INVALID_KNOWLEDGE'
  | 'INVALID_EPISODIC_LOG';

export interface StateParseError {
  code: StateParseErrorCode;
  message: string;
  details?: unknown;
}

export type StateParseResult<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined
> =
  | { ok: true; state: TypedAgentState<TTools, TStateSchema>; error?: never }
  | { ok: false; error: StateParseError; state?: never };

/**
 * Mapped type che esige l'esatta implementazione per ciascun tool dichiarato nel contratto.
 */
export type ToolImplementations<TTools extends Record<string, ToolContract>> = {
  [K in keyof TTools]: (
    args: z.infer<TTools[K]['parameters']>
  ) =>
    | Promise<TTools[K]['returns'] extends z.ZodType ? z.infer<TTools[K]['returns']> : ToolResult>
    | (TTools[K]['returns'] extends z.ZodType ? z.infer<TTools[K]['returns']> : ToolResult);
};

export type InferInitialState<TStateSchema> = TStateSchema extends z.ZodType
  ? z.infer<TStateSchema>
  : DataRecord;

/**
 * ============================================================================
 * TIPO DELLO STATO FORTEMENTE TIPIZZATO SUL CONTRATTO
 * ============================================================================
 */
export type TypedAgentState<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined
> = {
  I: string;
  Ms: string;
  Ds: TStateSchema extends z.ZodType ? z.infer<TStateSchema> : DataRecord;
  Ta: (keyof TTools & string)[];
  Ka: Concept[];
  Ep: Message[];
};

/**
 * Binding esecutivo: esecutori dei tool e stato iniziale concreto.
 * Se lo stateSchema è definito nel contratto, initialState è obbligatorio e strettamente tipizzato.
 * Se non è definito, initialState non deve essere specificato.
 */
export type AgentBinding<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined
> = {
  /** Esecutori asincroni tipizzati per ciascun tool dichiarato nel contratto */
  tools: ToolImplementations<TTools>;
} & (TStateSchema extends z.ZodType
  ? { initialState: z.infer<TStateSchema> }
  : { initialState?: never });

/**
 * Interfaccia della definizione dell'agente prima del binding esecutivo.
 */
export interface AgentDefinition<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef>
> {
  readonly contract: AgentContract<TTools, TStateSchema, TTerminations>;
  implement(
    binding: AgentBinding<TTools, TStateSchema>
  ): ImplementedAgent<TTools, TStateSchema, TTerminations>;
  /**
   * Convalida e raffina a runtime uno stato 'unknown'
   * restituendo un Result tipizzato (StateParseResult) senza lanciare eccezioni.
   */
  parseState(raw: unknown): StateParseResult<TTools, TStateSchema>;

  /**
   * Crea un EvaluationCollector fortemente tipizzato sullo stato (Ds), tool (Ta) e terminazioni di questo agente.
   */
  createEvaluationCollector(): EvaluationCollector<TTools, TStateSchema, TTerminations>;

  /**
   * Estrae ed organizza la traiettoria comportamentale oggettiva da uno stato S fortemente tipizzato (TypedAgentState)
   * senza rieseguire l'agente o avviare il runtime.
   */
  extractTrajectory(state: TypedAgentState<TTools, TStateSchema>): BehavioralTrajectory<TTools, TStateSchema, TTerminations>;
}

/**
 * Interfaccia dell'agente completamente implementato e pronto per il runtime.
 */
export interface ImplementedAgent<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef>
> {
  readonly contract: AgentContract<TTools, TStateSchema, TTerminations>;
  readonly manifest: AgentManifest<DataValue>;
  readonly world: WorldRegistry;

  /**
   * Crea un EvaluationCollector fortemente tipizzato sullo stato (Ds), tool (Ta) e terminazioni di questo agente.
   */
  createEvaluationCollector(): EvaluationCollector<TTools, TStateSchema, TTerminations>;

  /**
   * Estrae ed organizza la traiettoria comportamentale oggettiva da uno stato S fortemente tipizzato (TypedAgentState)
   * senza rieseguire l'agente o avviare il runtime.
   */
  extractTrajectory(state: TypedAgentState<TTools, TStateSchema>): BehavioralTrajectory<TTools, TStateSchema, TTerminations>;

  /**
   * Convalida e raffina a runtime uno stato 'unknown'
   * restituendo un Result tipizzato (StateParseResult) senza lanciare eccezioni.
   */
  parseState(raw: unknown): StateParseResult<TTools, TStateSchema>;

  /**
   * Spawna un'istanza dell'agente nel runtime collegandola automaticamente al Mondo implementato.
   */
  spawn(
    engine: FrameworkEngine,
    model: LanguageModelAdapter
  ): AgentInstance<DataValue>;

  /**
   * Spawna un'istanza dell'agente nel runtime ripartendo da uno stato pregresso fortemente tipizzato.
   * Calcola deterministicamente la fase FSM e l'indice temporale dall'Ep dello stato.
   */
  spawnFromState(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    state: TypedAgentState<TTools, TStateSchema>
  ): AgentInstance<DataValue>;

  /**
   * Esegue l'agente end-to-end gestendo spawn e run in una singola invocazione.
   * Ritorna un esito tipizzato con unione discriminata sul tipo di terminazione e relativo payload Zod.
   */
  run(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunResult<TTerminations>>;

  /**
   * Esegue l'agente a partire da uno stato pregresso fortemente tipizzato fino alla terminazione (halt).
   */
  runFromState(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    state: TypedAgentState<TTools, TStateSchema>,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunResult<TTerminations>>;
}
