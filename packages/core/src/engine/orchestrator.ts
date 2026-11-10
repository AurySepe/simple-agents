import { z } from 'zod';
import { AgentEvent, AgentObserver, CompositeObserver } from '../observability/index.js';
import {
  ActiveFSMState,
  AgentManifest,
  AgentState,
  createEpEvent,
  DataRecord,
  DataValue,
  DeliberationStall,
  DiagnosticErrorPayload,
  ExitResult,
  FSMControlState,
  InferenceTriple,
  LanguageModelAdapter,
  isDataRecord,
  isDataValue,
  Message,
  MessageInput,
  ModelResult,
  normalizeToolCall,
  SyntaxErrorToolCall,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TransitionReasonCode,
  UserPayload,
  ValidToolCall
} from '../types/index.js';
import { WorldRegistry } from '../world/index.js';
import { computeVisibleTools, SystemFrameProjector } from './projection.js';
import { defaultMarkdownProjector } from '../defaults/projectors/markdown-projector.js';
import { defaultOperationalPolicy, OperationalPolicy } from '../defaults/policies/operational-policy.js';
import { deriveFSMState, deriveTimeIndex } from '../definition/state-parser.js';

export type { OperationalPolicy as OrchestratorPolicy } from '../defaults/policies/operational-policy.js';

/**
 * ============================================================================
 * PAYLOAD ESOGENO DI RISVEGLIO DEL MONDO: P_c
 * ============================================================================
 */
export interface WakeupPayload {
  userContent?: UserPayload;
  worldResults?: Array<{ callId: string; result: ToolResult }>;
}

export type { FSMControlState, TransitionReasonCode } from '../types/index.js';

/**
 * ============================================================================
 * ESITI DI UN PASSO DELL'AUTOMA Ω: Tagged Unions
 * ============================================================================
 */
export type RunningStepOutcome = {
  status: 'running';
  controlState: FSMControlState;
  macroCycle: number;
  tick: number;
  state: AgentState;
};

export type YieldStepOutcome = {
  status: 'yield';
  macroCycle: number;
  tick: number;
  pendingCalls: ToolCall[];
  state: AgentState;
};

export type HaltStepOutcome<T = DataValue> = {
  status: 'halt';
  macroCycle: number;
  tick: number;
  result: ExitResult<T>;
  state: AgentState;
};

export type StallStepOutcome = {
  status: 'stall';
  macroCycle: number;
  tick: number;
  stall: DeliberationStall;
  state: AgentState;
};

export type StepOutcome<T = DataValue> =
  | RunningStepOutcome
  | YieldStepOutcome
  | HaltStepOutcome<T>
  | StallStepOutcome;

export type ExecutionOutcome<T = DataValue> =
  | YieldStepOutcome
  | HaltStepOutcome<T>
  | StallStepOutcome;

/**
 * Opzioni di configurazione per l'esecuzione autonoma end-to-end (run)
 */
export interface RunOptions<T = DataValue> {
  userContent?: UserPayload;
  maxMacroCycles?: number;
  maxTicks?: number;
  observers?: AgentObserver[];
  signal?: AbortSignal;
  onMacroCycle?: (macroCycle: number, outcome: ExecutionOutcome<T>) => void | Promise<void>;
  beforeToolExecution?: (toolId: string, args: DataRecord) => void | Promise<void>;
  afterToolExecution?: (toolId: string, args: DataRecord, result: ToolResult) => void | Promise<void>;
}

export interface BaseRunResult {
  macroCycles: number;
  ticks: number;
  state: AgentState;
}

export interface HaltRunResult<T = DataValue> extends BaseRunResult {
  status: 'halt';
  result: ExitResult<T>;
  stall?: never;
  reason?: never;
  error?: never;
}

export interface StallRunResult extends BaseRunResult {
  status: 'stall';
  stall: DeliberationStall;
  result?: never;
  reason?: never;
  error?: never;
}

export interface SuspendedRunResult extends BaseRunResult {
  status: 'suspended';
  reason: 'aborted' | 'cycle_limit' | 'tick_limit';
  stall?: never;
  result?: never;
  error?: never;
}

export interface ExecutionErrorDetail {
  code: 'TOOL_EXECUTION_ERROR' | 'QUIESCENCE_VIOLATION' | 'UNHANDLED_ERROR';
  message: string;
  details?: unknown;
}

export interface ErrorRunResult extends BaseRunResult {
  status: 'error';
  error: ExecutionErrorDetail;
  result?: never;
  stall?: never;
  reason?: never;
}

export type RunResult<T = DataValue> =
  | HaltRunResult<T>
  | StallRunResult
  | SuspendedRunResult
  | ErrorRunResult;

export type FeedPayloadResult =
  | { ok: true; error?: never }
  | {
      ok: false;
      error: {
        code: 'QUIESCENCE_VIOLATION';
        message: string;
        currentPhase: FSMControlState;
      };
    };

/**
 * ============================================================================
 * CONFIGURAZIONE DEL LIVELLO 1: IL FRAMEWORK IMMUTABILE (Ω_op)
 * ============================================================================
 */
export interface FrameworkConfig {
  systemFrameProjector?: SystemFrameProjector;
  policy?: OperationalPolicy;
  observers?: AgentObserver[];
  /**
   * Formattatore personalizzato per le descrizioni dei contratti di terminazione (A_term).
   * Consente all'utente di definire come segnalare al modello che l'azione è un'azione terminale.
   * Se non specificato, usa il default del framework.
   */
  formatTerminationDescription?: (id: string, description: string) => string;
  /**
   * Formattatore personalizzato per accodare la specifica dello schema di ritorno (returns)
   * alla descrizione del tool fisico esposta all'LLM.
   * Se non specificato, usa il default del framework.
   */
  formatToolReturnDescription?: (id: string, description: string, returnsSchema: z.ZodType) => string;
}

/**
 * ============================================================================
 * CLASSE LIVELLO 1: FrameworkEngine (Il Motore di Transizione Immutabile)
 * ============================================================================
 */
export interface AgentPackage<T = DataValue> {
  manifest: AgentManifest<T>;
  world: WorldRegistry;
}

export function isAgentPackage<T = DataValue>(
  value: unknown
): value is AgentPackage<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'manifest' in value &&
    'world' in value
  );
}

export class FrameworkEngine {
  constructor(private readonly config: FrameworkConfig = {}) {}

  public bindWorld(world: WorldRegistry): BoundRuntime {
    return new BoundRuntime(this.config, world);
  }

  /**
   * Spawna un'istanza dell'agente nel runtime (approccio engine-first).
   * Accetta un pacchetto agente (dotato di manifest e world) oppure un manifesto puro con world separato.
   */
  public spawn<T extends DataValue = DataValue>(
    agent: AgentPackage<T> | AgentManifest<T>,
    model: LanguageModelAdapter,
    world?: WorldRegistry,
    initialState?: AgentState
  ): AgentInstance<T> {
    if (isAgentPackage<T>(agent)) {
      return this.bindWorld(agent.world).spawnAgent(agent.manifest, model, initialState);
    }
    if (!world) {
      throw new Error("To spawn a pure AgentManifest, a WorldRegistry must be provided as the third parameter.");
    }
    return this.bindWorld(world).spawnAgent(agent, model, initialState);
  }

  /**
   * Esegue un agente nel runtime (approccio engine-first).
   * Accetta un pacchetto agente oppure un manifesto puro con world separato.
   */
  public async run<T extends DataValue = DataValue>(
    agent: AgentPackage<T> | AgentManifest<T>,
    model: LanguageModelAdapter,
    options?: RunOptions<T> & { world?: WorldRegistry; initialState?: AgentState }
  ): Promise<RunResult<T>> {
    if (isAgentPackage<T>(agent)) {
      return await this.bindWorld(agent.world).runAgent(agent.manifest, model, options);
    }
    if (!options?.world) {
      throw new Error("To run a pure AgentManifest, a WorldRegistry must be provided in options.world.");
    }
    return await this.bindWorld(options.world).runAgent(agent, model, options);
  }
}

/**
 * ============================================================================
 * CLASSE LIVELLO 2: BoundRuntime (Ambiente Aziendale Rilegato a W)
 * ============================================================================
 */
export class BoundRuntime {
  private observers: AgentObserver[] = [];

  constructor(
    private readonly frameworkConfig: FrameworkConfig,
    private readonly world: WorldRegistry
  ) {}

  public addObserver(observer: AgentObserver): void {
    this.observers.push(observer);
  }

  public spawnAgent<T extends DataValue = DataValue>(
    manifest: AgentManifest<T>,
    model: LanguageModelAdapter,
    initialState?: AgentState
  ): AgentInstance<T> {
    const agent = new AgentInstance<T>(this.frameworkConfig, this.world, manifest, model, initialState);
    for (const obs of this.observers) {
      agent.addObserver(obs);
    }
    return agent;
  }

  public async runAgent<T extends DataValue = DataValue>(
    manifest: AgentManifest<T>,
    model: LanguageModelAdapter,
    options?: RunOptions<T> & { initialState?: AgentState }
  ): Promise<RunResult<T>> {
    const agent = this.spawnAgent<T>(manifest, model, options?.initialState);
    return await agent.run(options);
  }
}

/**
 * ============================================================================
 * CLASSE LIVELLO 3: AgentInstance (Sessione Attiva dell'Automa FSM M_FSM)
 * ============================================================================
 */
export class AgentInstance<T extends DataValue = DataValue> {
  private state: AgentState;
  private c: number = 0; // Macro-Ciclo del Mondo
  private t: number = 0; // Tick decisionale di inferenza

  private fsm: ActiveFSMState<T> = { phase: 'q_sleep' };
  private compositeObserver: CompositeObserver = new CompositeObserver();

  private readonly projector: SystemFrameProjector;
  private readonly policy: OperationalPolicy;

  constructor(
    private readonly framework: FrameworkConfig,
    private readonly world: WorldRegistry,
    private readonly manifest: AgentManifest<T>,
    private readonly model: LanguageModelAdapter,
    initialState?: AgentState
  ) {
    this.projector = this.framework.systemFrameProjector ?? defaultMarkdownProjector;
    this.policy = this.framework.policy ?? defaultOperationalPolicy;

    if (this.framework.observers) {
      for (const obs of this.framework.observers) {
        this.compositeObserver.addObserver(obs);
      }
    }

    if (initialState) {
      this.state = {
        I: initialState.I,
        Ms: initialState.Ms,
        Ds: { ...initialState.Ds },
        Ta: new Set(initialState.Ta),
        Ka: new Map(initialState.Ka),
        Ep: [...initialState.Ep]
      };
      const tau = deriveTimeIndex(this.state.Ep);
      this.c = tau.c;
      this.t = tau.t;
      this.fsm = deriveFSMState(this.state, this.manifest.A_term);
    } else {
      // Inizializzazione dello Stato S_0 dal Manifesto
      this.state = {
        I: this.manifest.I,
        Ms: this.manifest.Ms0,
        Ds: this.manifest.Ds0 ? { ...this.manifest.Ds0 } : {},
        Ta: this.manifest.Ta0 ? new Set(this.manifest.Ta0) : new Set(),
        Ka: this.manifest.Ka0
          ? new Map(Array.from(this.manifest.Ka0).map((c) => [c.name, c]))
          : new Map(),
        Ep: this.manifest.Ep0 ? [...this.manifest.Ep0] : []
      };
    }
  }

  public addObserver(observer: AgentObserver): void {
    this.compositeObserver.addObserver(observer);
  }

  public removeObserver(observer: AgentObserver): void {
    this.compositeObserver.removeObserver(observer);
  }

  public async emitEvent(event: AgentEvent): Promise<void> {
    await this.compositeObserver.onEvent(event);
  }

  private transitionTo(
    nextFsm: ActiveFSMState<T>,
    reasonCode: TransitionReasonCode,
    context?: DataRecord
  ): void {
    const from = this.fsm.phase;
    const to = nextFsm.phase;
    this.fsm = nextFsm;

    if (from !== to) {
      void this.emitEvent({
        type: 'state_transition',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        from,
        to,
        reasonCode,
        context
      });
    }
  }

  public getState(): Readonly<AgentState> {
    return this.state;
  }

  public getSnapshot(): Readonly<AgentState> {
    return {
      I: this.state.I,
      Ms: this.state.Ms,
      Ds: { ...this.state.Ds },
      Ta: new Set(this.state.Ta),
      Ka: new Map(this.state.Ka),
      Ep: [...this.state.Ep]
    };
  }

  public getControlState(): FSMControlState {
    return this.fsm.phase;
  }

  public getActiveFSMState(): Readonly<ActiveFSMState<T>> {
    return this.fsm;
  }

  public getTimeIndex(): { c: number; t: number } {
    return { c: this.c, t: this.t };
  }

  public setControlState(state: ActiveFSMState<T>, reasonCode: TransitionReasonCode = 'manual_override'): void {
    this.transitionTo(state, reasonCode);
  }

  public appendMessage(msgInput: MessageInput): Message {
    const fullMessage = createEpEvent(msgInput, this.state.Ep.length, { c: this.c, t: this.t });
    this.state.Ep.push(fullMessage);
    return fullMessage;
  }

  /**
   * Invia un payload esogeno all'agente risvegliandolo.
   * Restituisce un FeedPayloadResult per segnalare violazioni di quiescenza senza eccezioni.
   */
  public feedPayload(payload: WakeupPayload): FeedPayloadResult {
    // Validazione rigorosa del Vincolo di Quiescenza:
    // Lo stimolo utente può essere fornito esclusivamente quando l'agente è a riposo (q_sleep o q_halt)
    if (payload.userContent !== undefined) {
      if (this.fsm.phase !== 'q_sleep' && this.fsm.phase !== 'q_halt') {
        return {
          ok: false,
          error: {
            code: 'QUIESCENCE_VIOLATION',
            message: `User stimulus can only be provided when the agent is in a quiescent state ('q_sleep' or 'q_halt'). Current control state: '${this.fsm.phase}'.`,
            currentPhase: this.fsm.phase
          }
        };
      }
    }

    void this.emitEvent({
      type: 'macro_cycle_start',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      userContent: payload.userContent,
      worldResults: payload.worldResults
    });

    // 1. Accodamento esiti dal Mondo fisico
    if (payload.worldResults && payload.worldResults.length > 0) {
      for (const res of payload.worldResults) {
        this.appendMessage({
          type: 'result',
          callId: res.callId,
          content: res.result
        });
      }

      if (this.fsm.phase === 'q_yield') {
        this.c++;
        this.transitionTo({ phase: 'q_exec' }, 'post_yield_exec');
      }
    }

    // 2. Accodamento stimolo utente esogeno
    if (payload.userContent !== undefined) {
      this.appendMessage({
        type: 'stimulus',
        content: payload.userContent
      });

      this.transitionTo({ phase: 'q_exec' }, 'stimulus_received');
    }

    return { ok: true };
  }

  public wakeup(payload: WakeupPayload): FeedPayloadResult {
    return this.feedPayload(payload);
  }

  private buildInferenceTriple(): InferenceTriple {
    const systemFrame = this.projector.renderFrame(this.state);
    const targetToolId = this.fsm.phase === 'q_repair' ? this.fsm.targetToolId : undefined;
    const visibleTools = computeVisibleTools(
      this.fsm.phase,
      this.state,
      this.manifest,
      this.world,
      {
        targetRepairToolId: targetToolId,
        formatTerminationDescription: this.framework.formatTerminationDescription,
        formatToolReturnDescription: this.framework.formatToolReturnDescription
      }
    );

    return {
      systemFrame,
      messages: this.state.Ep,
      visibleTools
    };
  }

  /**
   * Avanza la computazione di esattamente UN singolo micro-passo decisionale.
   */
  public async step(): Promise<StepOutcome<T>> {
    void this.emitEvent({
      type: 'step_start',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.fsm.phase,
      stateSnapshot: this.getSnapshot()
    });

    switch (this.fsm.phase) {
      case 'q_sleep': {
        throw new Error(
          "Agent is in 'q_sleep' state. Use 'feedPayload(payload)' to provide a stimulus."
        );
      }

      case 'q_halt': {
        return {
          status: 'halt',
          macroCycle: this.c,
          tick: this.t,
          result: this.fsm.exitResult,
          state: this.state
        };
      }

      case 'q_stall': {
        return {
          status: 'stall',
          macroCycle: this.c,
          tick: this.t,
          stall: this.fsm.stall,
          state: this.state
        };
      }

      case 'q_yield': {
        throw new Error(
          "Agent is awaiting external world results in 'q_yield'. Provide results using 'feedPayload({ worldResults })'."
        );
      }

      case 'q_repair': {
        return await this.stepRepair(this.fsm);
      }

      case 'q_exec': {
        return await this.stepExec();
      }

      default: {
        const _exhaustive: never = this.fsm;
        throw new Error(`Unhandled FSM state: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /**
   * Ciclo di deliberazione ed esecuzione operativa ordinaria (q_exec)
   */
  private async stepExec(): Promise<StepOutcome<T>> {
    const context = this.buildInferenceTriple();
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.fsm.phase,
      context,
      output,
      durationMs,
      stateSnapshot: this.getSnapshot()
    });

    // Se il modello è in stallo deliberativo (thinking budget esaurito)
    if (output.status === 'stall') {
      if (output.stall.partialThought) {
        this.appendMessage({
          type: 'thought',
          content: output.stall.partialThought
        });
      }

      this.transitionTo(
        { phase: 'q_stall', stall: output.stall },
        'exec_deliberation_stall',
        { reason: output.stall.reason }
      );
      this.t++;

      void this.emitEvent({
        type: 'stall',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        stall: output.stall,
        stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
      });

      return {
        status: 'stall',
        macroCycle: this.c,
        tick: this.t,
        stall: output.stall,
        state: this.state
      };
    }

    // 1. Accodamento evento deliberativo thought se presente
    if (output.thought) {
      this.appendMessage({
        type: 'thought',
        content: output.thought
      });
    }

    const calls: ToolCall[] = output.calls.map(normalizeToolCall);

    // Sottocaso A: Errore di sintassi JSON generato dal modello
    const syntaxErrCall = calls.find((c): c is SyntaxErrorToolCall => c.status === 'syntax_error');
    if (syntaxErrCall) {
      this.appendMessage({
        type: 'action',
        callId: syntaxErrCall.id,
        content: { name: syntaxErrCall.name, payload: { raw: syntaxErrCall.rawText } }
      });

      const errPayload = this.policy.formatDiagnosticPayload(
        'SYNTAX_ERROR',
        this.policy.formatSyntaxErrorMessage(
          syntaxErrCall.name,
          syntaxErrCall.rawText,
          syntaxErrCall.errorDetail
        ),
        { rawText: syntaxErrCall.rawText, detail: syntaxErrCall.errorDetail }
      );

      this.appendMessage({
        type: 'result',
        callId: syntaxErrCall.id,
        content: errPayload
      });

      this.transitionTo(
        { phase: 'q_repair', targetToolId: syntaxErrCall.name, targetCallId: syntaxErrCall.id },
        'exec_syntax_error',
        { toolId: syntaxErrCall.name }
      );
      this.t++;

      void this.emitEvent({
        type: 'tool_error',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        targetToolId: syntaxErrCall.name,
        callId: syntaxErrCall.id,
        errorPayload: errPayload
      });

      return {
        status: 'running',
        controlState: this.fsm.phase,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // Sottocaso B: Azione contrattuale di Terminazione (A_term)
    const termCall = calls.find((c) =>
      this.manifest.A_term.some((term) => term.id === c.name)
    );

    if (termCall) {
      const termContract = this.manifest.A_term.find((term) => term.id === termCall.name)!;
      const parsed = termContract.schema.safeParse(termCall.payload);

      if (!parsed.success) {
        const rawTermValue = isDataValue(termCall.payload) ? termCall.payload : String(termCall.payload);
        const termPayload: DataRecord = isDataRecord(rawTermValue)
          ? rawTermValue
          : { value: rawTermValue };

        this.appendMessage({
          type: 'action',
          callId: termCall.id,
          content: { name: termCall.name, payload: termPayload }
        });

        const detail = JSON.stringify(parsed.error.format());
        const errPayload = this.policy.formatDiagnosticPayload(
          'SCHEMA_VALIDATION_ERROR',
          this.policy.formatSchemaErrorMessage(termCall.name, detail),
          parsed.error.format()
        );

        this.appendMessage({
          type: 'result',
          callId: termCall.id,
          content: errPayload
        });

        this.transitionTo(
          { phase: 'q_repair', targetToolId: termCall.name, targetCallId: termCall.id },
          'exec_schema_error',
          { toolId: termCall.name }
        );
        this.t++;

        void this.emitEvent({
          type: 'tool_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: termCall.name,
          callId: termCall.id,
          errorPayload: errPayload
        });

        return {
          status: 'running',
          controlState: this.fsm.phase,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      // Terminazione valida e riuscita
      const rawTermValue = isDataValue(parsed.data) ? parsed.data : String(parsed.data);
      const termPayload: DataRecord = isDataRecord(rawTermValue)
        ? rawTermValue
        : { value: rawTermValue };

      this.appendMessage({
        type: 'action',
        callId: termCall.id,
        content: { name: termCall.name, payload: termPayload }
      });

      this.t++;
      const exitResult: ExitResult<T> = {
        type: termCall.name,
        payload: parsed.data
      };
      this.transitionTo({ phase: 'q_halt', exitResult }, 'exec_term_success', { toolId: termCall.name });

      void this.emitEvent({
        type: 'halt',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        result: exitResult,
        stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
      });

      return {
        status: 'halt',
        macroCycle: this.c,
        tick: this.t,
        result: exitResult,
        state: this.state
      };
    }

    // Sottocaso C: Azioni sul Mondo Fisico (Y ⊆ Ta)
    const validWorldCalls: ValidToolCall[] = [];

    for (const call of calls) {
      if (!this.state.Ta.has(call.name)) {
        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: call.payload }
        });

        const errPayload = this.policy.formatDiagnosticPayload(
          'UNMOUNTED_TOOL',
          `Il tool '${call.name}' non è montato nel toolbelt attivo Ta.`,
          { toolId: call.name }
        );

        this.appendMessage({
          type: 'result',
          callId: call.id,
          content: errPayload
        });

        this.transitionTo(
          { phase: 'q_repair', targetToolId: call.name, targetCallId: call.id },
          'exec_schema_error',
          { toolId: call.name }
        );
        this.t++;

        void this.emitEvent({
          type: 'tool_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          callId: call.id,
          errorPayload: errPayload
        });

        return {
          status: 'running',
          controlState: this.fsm.phase,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const worldDef = this.world.getToolDefinition(call.name);
      if (!worldDef) {
        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: call.payload }
        });

        const errPayload = this.policy.formatDiagnosticPayload(
          'UNKNOWN_ACTION',
          `Il tool '${call.name}' non è registrato nel catalogo W.`,
          { toolId: call.name }
        );

        this.appendMessage({
          type: 'result',
          callId: call.id,
          content: errPayload
        });

        this.transitionTo(
          { phase: 'q_repair', targetToolId: call.name, targetCallId: call.id },
          'exec_schema_error',
          { toolId: call.name }
        );
        this.t++;

        void this.emitEvent({
          type: 'tool_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          callId: call.id,
          errorPayload: errPayload
        });

        return {
          status: 'running',
          controlState: this.fsm.phase,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const parsed = worldDef.parameters.safeParse(call.payload);
      if (!parsed.success) {
        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: call.payload }
        });

        const detail = JSON.stringify(parsed.error.format());
        const errPayload = this.policy.formatDiagnosticPayload(
          'SCHEMA_VALIDATION_ERROR',
          this.policy.formatSchemaErrorMessage(call.name, detail),
          parsed.error.format()
        );

        this.appendMessage({
          type: 'result',
          callId: call.id,
          content: errPayload
        });

        this.transitionTo(
          { phase: 'q_repair', targetToolId: call.name, targetCallId: call.id },
          'exec_schema_error',
          { toolId: call.name }
        );
        this.t++;

        void this.emitEvent({
          type: 'tool_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          callId: call.id,
          errorPayload: errPayload
        });

        return {
          status: 'running',
          controlState: this.fsm.phase,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      validWorldCalls.push({
        status: 'valid',
        id: call.id,
        name: call.name,
        payload: parsed.data
      });
    }

    // Tutte le chiamate ai tool fisici sono valide: registrazione e yield
    for (const validCall of validWorldCalls) {
      this.appendMessage({
        type: 'action',
        callId: validCall.id,
        content: { name: validCall.name, payload: validCall.payload }
      });
    }

    this.t++;
    this.transitionTo({ phase: 'q_yield', pendingCalls: validWorldCalls }, 'exec_world_yield');

    void this.emitEvent({
      type: 'yield',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      pendingCalls: validWorldCalls
    });

    return {
      status: 'yield',
      macroCycle: this.c,
      tick: this.t,
      pendingCalls: validWorldCalls,
      state: this.state
    };
  }

  /**
   * Micro-passo nello stato di riparazione schema (q_repair)
   */
  private async stepRepair(repairState: {
    phase: 'q_repair';
    targetToolId: string;
    targetCallId: string;
  }): Promise<StepOutcome<T>> {
    const context = this.buildInferenceTriple();
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.fsm.phase,
      context,
      output,
      durationMs,
      stateSnapshot: this.getSnapshot()
    });

    if (output.status === 'stall') {
      if (output.stall.partialThought) {
        this.appendMessage({
          type: 'thought',
          content: output.stall.partialThought
        });
      }

      this.transitionTo(
        { phase: 'q_stall', stall: output.stall },
        'exec_deliberation_stall',
        { reason: output.stall.reason }
      );
      this.t++;

      void this.emitEvent({
        type: 'stall',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        stall: output.stall,
        stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
      });

      return {
        status: 'stall',
        macroCycle: this.c,
        tick: this.t,
        stall: output.stall,
        state: this.state
      };
    }

    if (output.thought) {
      this.appendMessage({
        type: 'thought',
        content: output.thought
      });
    }

    const firstCall = normalizeToolCall(output.calls[0]);

    // Se l'agente emette l'azione speciale di abort
    if (firstCall.name === 'a_abort_call') {
      this.appendMessage({
        type: 'action',
        callId: firstCall.id,
        content: { name: 'a_abort_call', payload: {} }
      });

      this.appendMessage({
        type: 'result',
        callId: firstCall.id,
        content: { status: 'aborted', target: repairState.targetToolId }
      });

      this.transitionTo({ phase: 'q_exec' }, 'repair_abort');
      this.t++;

      return {
        status: 'running',
        controlState: this.fsm.phase,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // Se l'agente riprova a emettere il tool target corretto
    if (firstCall.name === repairState.targetToolId && firstCall.status === 'valid') {
      // 1. Controlliamo se è un contratto terminale
      const termContract = this.manifest.A_term.find((term) => term.id === firstCall.name);
      if (termContract) {
        const parsed = termContract.schema.safeParse(firstCall.payload);
        if (parsed.success) {
          const rawTermValue = isDataValue(parsed.data) ? parsed.data : String(parsed.data);
          const termPayload: DataRecord = isDataRecord(rawTermValue)
            ? rawTermValue
            : { value: rawTermValue };

          this.appendMessage({
            type: 'action',
            callId: firstCall.id,
            content: { name: firstCall.name, payload: termPayload }
          });

          this.t++;
          const exitResult: ExitResult<T> = {
            type: firstCall.name,
            payload: parsed.data
          };
          this.transitionTo({ phase: 'q_halt', exitResult }, 'exec_term_success', { toolId: firstCall.name });

          void this.emitEvent({
            type: 'halt',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            result: exitResult,
            stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
          });

          return {
            status: 'halt',
            macroCycle: this.c,
            tick: this.t,
            result: exitResult,
            state: this.state
          };
        }
      }

      // 2. Controlliamo se è un tool di Mondo montato in Ta
      if (this.state.Ta.has(firstCall.name)) {
        const worldDef = this.world.getToolDefinition(firstCall.name);
        if (worldDef) {
          const parsed = worldDef.parameters.safeParse(firstCall.payload);
          if (parsed.success) {
            this.appendMessage({
              type: 'action',
              callId: firstCall.id,
              content: { name: firstCall.name, payload: parsed.data }
            });

            this.t++;
            const validCall: ValidToolCall = {
              status: 'valid',
              id: firstCall.id,
              name: firstCall.name,
              payload: parsed.data
            };
            this.transitionTo({ phase: 'q_yield', pendingCalls: [validCall] }, 'exec_world_yield');

            void this.emitEvent({
              type: 'yield',
              timestamp: new Date(),
              macroCycle: this.c,
              tick: this.t,
              pendingCalls: [validCall]
            });

            return {
              status: 'yield',
              macroCycle: this.c,
              tick: this.t,
              pendingCalls: [validCall],
              state: this.state
            };
          }
        }
      }
    }

    // Riprova non valida: rimane in q_repair
    this.t++;
    return {
      status: 'running',
      controlState: this.fsm.phase,
      macroCycle: this.c,
      tick: this.t,
      state: this.state
    };
  }

  /**
   * Esegue step() continui finché non si cede il controllo (yield) o si termina (halt).
   */
  public async resume(maxSteps: number = 500): Promise<ExecutionOutcome<T>> {
    if (this.fsm.phase === 'q_yield') {
      return {
        status: 'yield',
        macroCycle: this.c,
        tick: this.t,
        pendingCalls: this.fsm.pendingCalls,
        state: this.state
      };
    }
    if (this.fsm.phase === 'q_halt') {
      return {
        status: 'halt',
        macroCycle: this.c,
        tick: this.t,
        result: this.fsm.exitResult,
        state: this.state
      };
    }
    if (this.fsm.phase === 'q_stall') {
      return {
        status: 'stall',
        macroCycle: this.c,
        tick: this.t,
        stall: this.fsm.stall,
        state: this.state
      };
    }

    let steps = 0;
    while (true) {
      if (++steps > maxSteps) {
        throw new Error(
          `Reached maximum step limit (${maxSteps}) during resume() without reaching yield, halt, or stall.`
        );
      }
      const outcome = await this.step();
      if (outcome.status === 'yield' || outcome.status === 'halt' || outcome.status === 'stall') {
        return outcome;
      }
    }
  }

  /**
   * Esegue l'agente end-to-end gestendo automaticamente i tool del mondo W.
   */
  public async run(options?: RunOptions<T>): Promise<RunResult<T>> {
    const maxMacroCycles = options?.maxMacroCycles ?? 50;
    const maxTicks = options?.maxTicks ?? 250;

    if (options?.observers) {
      for (const obs of options.observers) {
        this.addObserver(obs);
      }
    }

    try {
      if (options?.userContent !== undefined) {
        const feedRes = this.feedPayload({ userContent: options.userContent });
        if (!feedRes.ok) {
          void this.emitEvent({
            type: 'execution_error',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            error: feedRes.error,
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'error',
            error: feedRes.error,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }
      }

      while (true) {
        if (options?.signal?.aborted) {
          void this.emitEvent({
            type: 'suspend',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            reason: 'aborted',
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'suspended',
            reason: 'aborted',
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        if (this.c > maxMacroCycles) {
          void this.emitEvent({
            type: 'suspend',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            reason: 'cycle_limit',
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'suspended',
            reason: 'cycle_limit',
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }
        if (this.t > maxTicks) {
          void this.emitEvent({
            type: 'suspend',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            reason: 'tick_limit',
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'suspended',
            reason: 'tick_limit',
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        const outcome = await this.resume();

        if (options?.onMacroCycle) {
          await options.onMacroCycle(this.c, outcome);
        }

        if (outcome.status === 'halt') {
          return {
            status: 'halt',
            result: outcome.result,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        if (outcome.status === 'stall') {
          return {
            status: 'stall',
            stall: outcome.stall,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        // Se è stato richiesto un abort durante la deliberazione,
        // sospendiamo prima di eseguire fisicamente i tool nel mondo W
        if (options?.signal?.aborted) {
          void this.emitEvent({
            type: 'suspend',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            reason: 'aborted',
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'suspended',
            reason: 'aborted',
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        // Dispatch asincrono in parallelo dei tool di mondo in q_yield
        const toolExecutionOutcomes = await Promise.all(
          outcome.pendingCalls.map(async (call) => {
            if (options?.beforeToolExecution) {
              await options.beforeToolExecution(call.name, call.payload);
            }
            const startTime = Date.now();
            const execResult = await this.world.executeTool(call.name, call.payload);
            const durationMs = Date.now() - startTime;

            if (execResult.ok) {
              void this.emitEvent({
                type: 'world_action',
                timestamp: new Date(),
                macroCycle: this.c,
                tick: this.t,
                toolId: call.name,
                args: call.payload,
                status: 'success',
                result: execResult.data,
                durationMs
              });

              if (options?.afterToolExecution) {
                await options.afterToolExecution(call.name, call.payload, execResult.data);
              }
              return { ok: true as const, callId: call.id, result: execResult.data };
            } else {
              void this.emitEvent({
                type: 'world_action',
                timestamp: new Date(),
                macroCycle: this.c,
                tick: this.t,
                toolId: call.name,
                args: call.payload,
                status: 'failure',
                error: execResult.error.message,
                durationMs
              });
              return { ok: false as const, callId: call.id, error: execResult.error };
            }
          })
        );

        // Se un'azione fisica è fallita, interrompiamo l'esecuzione e restituiamo l'errore tipizzato
        const firstFailed = toolExecutionOutcomes.find((o) => !o.ok);
        if (firstFailed && !firstFailed.ok) {
          const errDetail: ExecutionErrorDetail = {
            code: 'TOOL_EXECUTION_ERROR',
            message: firstFailed.error.message,
            details: firstFailed.error
          };
          void this.emitEvent({
            type: 'execution_error',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            error: errDetail,
            stateSnapshot: this.getSnapshot()
          });
          return {
            status: 'error',
            error: errDetail,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        const worldResults = toolExecutionOutcomes.map((o) => {
          if (!o.ok) throw new Error('Unreachable');
          return { callId: o.callId, result: o.result };
        });

        this.feedPayload({ worldResults });
      }
    } finally {
      if (options?.observers) {
        for (const obs of options.observers) {
          this.removeObserver(obs);
        }
      }
    }
  }
}
