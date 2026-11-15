import { z } from 'zod';
import {
  Concept,
  DataRecord,
  DataValue,
  DeliberationStall,
  Message,
  ToolResult,
  LanguageModelAdapter,
  AgentManifest,
  AgentState,
  UnexpectedModelError
} from '../types/index.js';
import {
  FrameworkEngine,
  AgentInstance,
  RunOptions,
  RunResult,
  StallRunResult,
  SuspendedRunResult,
  ErrorRunResult,
  RecoveryContext,
  RecoveryDecision
} from '../engine/orchestrator.js';
import { ToolReturn, UnexpectedToolError, WorldRegistry } from '../world/index.js';
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
 * ============================================================================
 * ERRORI INFRASTRUTTURALI / AMBIENTALI FORTEMENTE TIPIZZATI
 * ============================================================================
 */
export type WorldExecutionError<TToolErrorsMap extends Record<string, any>> = {
  [K in keyof TToolErrorsMap]: {
    code: 'TOOL_EXECUTION_ERROR';
    kind: 'TOOL_ERROR';
    toolName: K & string;
    error: TToolErrorsMap[K] | UnexpectedToolError;
    message: string;
  };
}[keyof TToolErrorsMap];

export type ModelExecutionError<TModelErrors> = {
  code: 'MODEL_EXECUTION_ERROR';
  kind: 'MODEL_ERROR';
  error: TModelErrors | UnexpectedModelError;
  message: string;
};

export type TypedAgentRunError<TToolErrorsMap extends Record<string, any> = Record<string, any>, TModelErrors = any> =
  | WorldExecutionError<TToolErrorsMap>
  | ModelExecutionError<TModelErrors>
  | { code: 'QUIESCENCE_VIOLATION'; kind: 'QUIESCENCE_VIOLATION'; currentState: string; message: string };

/**
 * ============================================================================
 * ESITO UNIFICATO DEL RUNNER: ok: true | false
 * ============================================================================
 */
export type AgentRunSuccess<TTerminations extends Record<string, TerminationContractDef>> = {
  ok: true;
  macroCycles: number;
  ticks: number;
  state: AgentState;
} & (
  | { status: 'halt'; result: InferTerminationsUnion<TTerminations>; stall?: never; reason?: never }
  | { status: 'stall'; stall: DeliberationStall; result?: never; reason?: never }
  | { status: 'suspended'; reason: 'aborted' | 'cycle_limit' | 'tick_limit'; result?: never; stall?: never }
);

export interface AgentRunFailure<
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>,
  TToolErrorsMap extends Record<string, any> = Record<string, any>,
  TModelErrors = any
> {
  ok: false;
  status: 'error';
  error: TypedAgentRunError<TToolErrorsMap, TModelErrors>;
  macroCycles: number;
  ticks: number;
  state: AgentState;
  resume: () => Promise<AgentRunnerResult<TTerminations, TToolErrorsMap, TModelErrors>>;
}

export type AgentRunnerResult<
  TTerminations extends Record<string, TerminationContractDef>,
  TToolErrorsMap extends Record<string, any> = Record<string, any>,
  TModelErrors = any
> =
  | AgentRunSuccess<TTerminations>
  | AgentRunFailure<TTerminations, TToolErrorsMap, TModelErrors>;

/**
 * Helper per estrarre il tipo dell'errore infrastrutturale da un tool return.
 */
export type ExtractToolCustomError<TReturn> = TReturn extends { ok: false; error: infer E }
  ? E
  : never;

/**
 * Mapped type che esige l'esatta implementazione per ciascun tool dichiarato nel contratto.
 * Supporta sia il ritorno diretto di TReturns, sia ToolReturn<TReturns, TCustomError>.
 */
export type ToolImplementations<
  TTools extends Record<string, ToolContract>,
  TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>,
  TWorld = undefined
> = {
  [K in keyof TTools]: (
    args: z.infer<TTools[K]['parameters']>,
    world: TWorld
  ) =>
    | Promise<ToolReturn<TTools[K]['returns'] extends z.ZodType ? z.infer<TTools[K]['returns']> : ToolResult, TToolErrorsMap[K]>>
    | ToolReturn<TTools[K]['returns'] extends z.ZodType ? z.infer<TTools[K]['returns']> : ToolResult, TToolErrorsMap[K]>;
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
  _TStateSchema extends z.ZodType | undefined = undefined,
  TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>,
  TWorld = undefined
> = {
  /** Esecutori asincroni tipizzati per ciascun tool dichiarato nel contratto */
  tools: ToolImplementations<TTools, TToolErrorsMap, TWorld>;
};

/**
 * Context passed to a `beforeToolUse` interceptor.
 */
export interface BeforeToolUseContext<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> {
  readonly state: Readonly<Omit<AgentState, 'Ds'> & { Ds: InferInitialState<TStateSchema> }>;
  readonly world: TWorld;
  readonly toolId: string;
  readonly args: DataRecord;
}

/**
 * Context passed to an `afterToolUse` interceptor.
 */
export interface AfterToolUseContext<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> {
  readonly state: Readonly<Omit<AgentState, 'Ds'> & { Ds: InferInitialState<TStateSchema> }>;
  readonly world: TWorld;
  readonly toolId: string;
  readonly args: DataRecord;
  readonly result: ToolResult;
}

/**
 * Pure interceptor executed before a tool call.
 * May optionally return a new `Ds` state to update the agent's domain state immutably.
 */
export type BeforeToolUseInterceptor<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> = (
  context: BeforeToolUseContext<TStateSchema, TWorld>
) => Promise<InferInitialState<TStateSchema> | void> | InferInitialState<TStateSchema> | void;

/**
 * Pure interceptor executed after a successful tool call.
 * May optionally return a new `Ds` state to update the agent's domain state immutably.
 */
export type AfterToolUseInterceptor<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> = (
  context: AfterToolUseContext<TStateSchema, TWorld>
) => Promise<InferInitialState<TStateSchema> | void> | InferInitialState<TStateSchema> | void;

/**
 * Context passed to a `beforeDeliberation` interceptor right before `renderFrame` and `model.infer`.
 */
export interface BeforeDeliberationContext<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> {
  readonly state: Readonly<Omit<AgentState, 'Ds'> & { Ds: InferInitialState<TStateSchema> }>;
  readonly world: TWorld;
  readonly macroCycle: number;
  readonly tick: number;
}

/**
 * Pure interceptor executed before every model deliberation (`q_exec`).
 * May optionally return a new `Ds` state to synchronize `TWorld -> Ds` immutably.
 */
export type BeforeDeliberationInterceptor<
  TStateSchema extends z.ZodType | undefined = undefined,
  TWorld = undefined
> = (
  context: BeforeDeliberationContext<TStateSchema, TWorld>
) => Promise<InferInitialState<TStateSchema> | void> | InferInitialState<TStateSchema> | void;

/**
 * Blueprint dell'agente (Fase 1): contiene il contratto e l'implementazione dei tool
 * parametrizzata su TWorld, non ancora legata a un'istanza concreta di mondo.
 */
export interface AgentBlueprint<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>,
  TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>,
  TWorld = undefined
> {
  readonly contract: AgentContract<TTools, TStateSchema, TTerminations>;
  readonly binding: AgentBinding<TTools, TStateSchema, TToolErrorsMap, TWorld>;

  /**
   * Fase 2: Lega il blueprint a un'istanza concreta di TWorld, producendo un ImplementedAgent eseguibile.
   * Per blueprint stateless (TWorld = undefined) si invoca senza argomenti: `.bind()`.
   */
  bind(
    ...args: TWorld extends undefined
      ? [world?: undefined, initialState?: InferInitialState<TStateSchema>]
      : [world: TWorld, initialState?: InferInitialState<TStateSchema>]
  ): ImplementedAgent<TTools, TStateSchema, TTerminations, TToolErrorsMap>;
}

/**
 * Interfaccia della definizione dell'agente prima del binding esecutivo.
 */
export interface AgentDefinition<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef>
> {
  readonly contract: AgentContract<TTools, TStateSchema, TTerminations>;
  implement<
    TWorld = undefined,
    TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>
  >(
    binding: AgentBinding<TTools, TStateSchema, TToolErrorsMap, TWorld>
  ): AgentBlueprint<TTools, TStateSchema, TTerminations, TToolErrorsMap, TWorld>;
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
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>,
  TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>
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
  spawn<TModelErrors = never>(
    engine: FrameworkEngine,
    model: LanguageModelAdapter<TModelErrors>
  ): AgentInstance<DataValue>;

  /**
   * Spawna un'istanza dell'agente nel runtime ripartendo da uno stato pregresso fortemente tipizzato.
   * Calcola deterministicamente la fase FSM e l'indice temporale dall'Ep dello stato.
   */
  spawnFromState<TModelErrors = never>(
    engine: FrameworkEngine,
    model: LanguageModelAdapter<TModelErrors>,
    state: TypedAgentState<TTools, TStateSchema>
  ): AgentInstance<DataValue>;

  /**
   * Esegue l'agente end-to-end gestendo spawn e run in una singola invocazione.
   * Ritorna un esito tipizzato con unione discriminata sul tipo di terminazione e relativo payload Zod.
   */
  run<TModelErrors = never>(
    engine: FrameworkEngine,
    model: LanguageModelAdapter<TModelErrors>,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunnerResult<TTerminations, TToolErrorsMap, TModelErrors>>;

  /**
   * Esegue l'agente a partire da uno stato pregresso fortemente tipizzato fino alla terminazione (halt).
   */
  runFromState<TModelErrors = never>(
    engine: FrameworkEngine,
    model: LanguageModelAdapter<TModelErrors>,
    state: TypedAgentState<TTools, TStateSchema>,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunnerResult<TTerminations, TToolErrorsMap, TModelErrors>>;
}
