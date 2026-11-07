import { LanguageModelAdapter } from '../adapters/index.js';
import { AgentEvent, AgentObserver, CompositeObserver } from '../observability/index.js';
import {
  AgentManifest,
  AgentState,
  DataRecord,
  DataValue,
  DiagnosticErrorPayload,
  ExitResult,
  FSMControlState,
  InferenceTriple,
  isDataRecord,
  isDataValue,
  Message,
  MessageInput,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TransitionReasonCode,
  UserPayload
} from '../types/index.js';
import { WorldRegistry } from '../world/index.js';
import { computeVisibleTools, SystemFrameProjector } from './projection.js';
import { defaultMarkdownProjector } from '../defaults/projectors/markdown-projector.js';
import { defaultItalianPolicy, OperationalPolicy } from '../defaults/policies/italian-policy.js';

export type { OperationalPolicy as OrchestratorPolicy } from '../defaults/policies/italian-policy.js';

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

export type StepOutcome<T = DataValue> = RunningStepOutcome | YieldStepOutcome | HaltStepOutcome<T>;

export type ExecutionOutcome<T = DataValue> = YieldStepOutcome | HaltStepOutcome<T>;

/**
 * Opzioni di configurazione per l'esecuzione autonoma end-to-end (run)
 */
export interface RunOptions<T = DataValue> {
  userContent?: UserPayload;
  maxMacroCycles?: number;
  maxTicks?: number;
  observers?: AgentObserver[];
  onMacroCycle?: (macroCycle: number, outcome: ExecutionOutcome<T>) => void | Promise<void>;
  beforeToolExecution?: (toolId: string, args: DataRecord) => void | Promise<void>;
  afterToolExecution?: (toolId: string, args: DataRecord, result: ToolResult) => void | Promise<void>;
}

export interface RunResult<T = DataValue> {
  result: ExitResult<T>;
  macroCycles: number;
  ticks: number;
  state: AgentState;
}

/**
 * ============================================================================
 * CONFIGURAZIONE DEL LIVELLO 1: IL FRAMEWORK IMMUTABILE (Ω_op)
 * ============================================================================
 */
export interface FrameworkConfig {
  systemFrameProjector?: SystemFrameProjector;
  policy?: OperationalPolicy;
  observers?: AgentObserver[];
}

/**
 * ============================================================================
 * CLASSE LIVELLO 1: FrameworkEngine (Il Motore di Transizione Immutabile)
 * ============================================================================
 */
export class FrameworkEngine {
  constructor(private readonly config: FrameworkConfig = {}) {}

  public bindWorld(world: WorldRegistry): BoundRuntime {
    return new BoundRuntime(this.config, world);
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
    model: LanguageModelAdapter
  ): AgentInstance<T> {
    const agent = new AgentInstance<T>(this.frameworkConfig, this.world, manifest, model);
    for (const obs of this.observers) {
      agent.addObserver(obs);
    }
    return agent;
  }

  public async runAgent<T extends DataValue = DataValue>(
    manifest: AgentManifest<T>,
    model: LanguageModelAdapter,
    options?: RunOptions<T>
  ): Promise<RunResult<T>> {
    const agent = this.spawnAgent<T>(manifest, model);
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

  private controlState: FSMControlState = 'q_sleep';
  private targetRepairToolId?: string;
  private targetRepairCallId?: string;
  private lastHaltResult: ExitResult<T> | null = null;
  private compositeObserver: CompositeObserver = new CompositeObserver();

  private readonly projector: SystemFrameProjector;
  private readonly policy: OperationalPolicy;

  constructor(
    private readonly framework: FrameworkConfig,
    private readonly world: WorldRegistry,
    private readonly manifest: AgentManifest<T>,
    private readonly model: LanguageModelAdapter
  ) {
    this.projector = this.framework.systemFrameProjector ?? defaultMarkdownProjector;
    this.policy = this.framework.policy ?? defaultItalianPolicy;

    if (this.framework.observers) {
      for (const obs of this.framework.observers) {
        this.compositeObserver.addObserver(obs);
      }
    }

    // Inizializzazione dello Stato S_0 dal Manifesto
    this.state = {
      I: this.manifest.I,
      Ms: this.manifest.Ms0,
      Ds: this.manifest.Ds0 ? { ...this.manifest.Ds0 } : {},
      Ta: this.manifest.Ta0 ? new Set(this.manifest.Ta0) : new Set(),
      Ka: this.manifest.Ka0
        ? new Map(Array.from(this.manifest.Ka0).map((c) => [c.id, c]))
        : new Map(),
      Ep: this.manifest.Ep0 ? [...this.manifest.Ep0] : []
    };
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
    newState: FSMControlState,
    reasonCode: TransitionReasonCode,
    context?: DataRecord
  ): void {
    if (this.controlState !== newState) {
      const from = this.controlState;
      this.controlState = newState;
      void this.emitEvent({
        type: 'state_transition',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        from,
        to: newState,
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
    return this.controlState;
  }

  public getTimeIndex(): { c: number; t: number } {
    return { c: this.c, t: this.t };
  }

  public setControlState(state: FSMControlState, reasonCode: TransitionReasonCode = 'manual_override'): void {
    this.transitionTo(state, reasonCode);
  }

  public appendMessage(msgInput: MessageInput): Message {
    const fullMessage: Message = {
      ...msgInput,
      index: this.state.Ep.length,
      tau: { c: this.c, t: this.t }
    } as Message;
    this.state.Ep.push(fullMessage);
    return fullMessage;
  }

  /**
   * Invia un payload esogeno all'agente risvegliandolo.
   */
  public feedPayload(payload: WakeupPayload): void {
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

      if (this.controlState === 'q_yield') {
        this.c++;
        this.transitionTo('q_exec', 'post_yield_exec');
      }
    }

    // 2. Accodamento stimolo utente esogeno
    if (payload.userContent !== undefined) {
      this.appendMessage({
        type: 'stimulus',
        content: payload.userContent
      });

      if (this.controlState === 'q_sleep' || this.controlState === 'q_halt') {
        this.transitionTo('q_exec', 'stimulus_received');
      }
    }
  }

  public wakeup(payload: WakeupPayload): void {
    this.feedPayload(payload);
  }

  private buildInferenceTriple(): InferenceTriple {
    const systemFrame = this.projector.renderFrame(this.state);
    const visibleTools = computeVisibleTools(
      this.controlState,
      this.state,
      this.manifest,
      this.world,
      this.targetRepairToolId
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
      controlState: this.controlState,
      stateSnapshot: this.getSnapshot()
    });

    switch (this.controlState) {
      case 'q_sleep': {
        throw new Error(
          "L'agente si trova in stato 'q_sleep'. Usa 'feedPayload(payload)' per inviare uno stimolo."
        );
      }

      case 'q_halt': {
        if (!this.lastHaltResult) {
          throw new Error("Stato inconsistente: l'agente è in 'q_halt' ma non è presente un risultato di arresto.");
        }
        return {
          status: 'halt',
          macroCycle: this.c,
          tick: this.t,
          result: this.lastHaltResult,
          state: this.state
        };
      }

      case 'q_yield': {
        throw new Error(
          "L'agente si trova in attesa asincrona 'q_yield'. Fornisci i risultati con 'feedPayload({ worldResults })'."
        );
      }

      case 'q_repair': {
        return await this.stepRepair();
      }

      case 'q_exec': {
        return await this.stepExec();
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
      controlState: this.controlState,
      context,
      output,
      durationMs,
      stateSnapshot: this.getSnapshot()
    });

    // 1. Accodamento evento deliberativo thought se presente
    if (output.thought) {
      this.appendMessage({
        type: 'thought',
        content: output.thought
      });
    }

    const calls = output.calls;

    // Sottocaso A: Errore di sintassi JSON generato dal modello
    const syntaxErrCall = calls.find((c) => c.status === 'syntax_error');
    if (syntaxErrCall && syntaxErrCall.status === 'syntax_error') {
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

      this.targetRepairToolId = syntaxErrCall.name;
      this.targetRepairCallId = syntaxErrCall.id;
      this.transitionTo('q_repair', 'exec_syntax_error', { toolId: syntaxErrCall.name });
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
        controlState: this.controlState,
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

        this.targetRepairToolId = termCall.name;
        this.targetRepairCallId = termCall.id;
        this.transitionTo('q_repair', 'exec_schema_error', { toolId: termCall.name });
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
          controlState: this.controlState,
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
      this.transitionTo('q_halt', 'exec_term_success', { toolId: termCall.name });
      this.lastHaltResult = {
        type: termCall.name,
        payload: parsed.data as T
      };

      void this.emitEvent({
        type: 'halt',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        result: this.lastHaltResult,
        stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
      });

      return {
        status: 'halt',
        macroCycle: this.c,
        tick: this.t,
        result: this.lastHaltResult,
        state: this.state
      };
    }

    // Sottocaso C: Azioni sul Mondo Fisico (Y ⊆ Ta)
    const validWorldCalls: ToolCall[] = [];

    for (const call of calls) {
      if (!this.state.Ta.has(call.name)) {
        const rawPayload = isDataValue(call.payload) ? call.payload : String(call.payload);
        const worldPayload: DataRecord = isDataRecord(rawPayload)
          ? rawPayload
          : { value: rawPayload };

        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: worldPayload }
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

        this.targetRepairToolId = call.name;
        this.targetRepairCallId = call.id;
        this.transitionTo('q_repair', 'exec_schema_error', { toolId: call.name });
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
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const worldDef = this.world.getToolDefinition(call.name);
      if (!worldDef) {
        const rawPayload = isDataValue(call.payload) ? call.payload : String(call.payload);
        const worldPayload: DataRecord = isDataRecord(rawPayload)
          ? rawPayload
          : { value: rawPayload };

        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: worldPayload }
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

        this.targetRepairToolId = call.name;
        this.targetRepairCallId = call.id;
        this.transitionTo('q_repair', 'exec_schema_error', { toolId: call.name });
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
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const parsed = worldDef.parameters.safeParse(call.payload);
      if (!parsed.success) {
        const rawPayload = isDataValue(call.payload) ? call.payload : String(call.payload);
        const worldPayload: DataRecord = isDataRecord(rawPayload)
          ? rawPayload
          : { value: rawPayload };

        this.appendMessage({
          type: 'action',
          callId: call.id,
          content: { name: call.name, payload: worldPayload }
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

        this.targetRepairToolId = call.name;
        this.targetRepairCallId = call.id;
        this.transitionTo('q_repair', 'exec_schema_error', { toolId: call.name });
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
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      validWorldCalls.push({
        id: call.id,
        name: call.name,
        payload: parsed.data as DataRecord
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
    this.transitionTo('q_yield', 'exec_world_yield');

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
  private async stepRepair(): Promise<StepOutcome<T>> {
    const context = this.buildInferenceTriple();
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.controlState,
      context,
      output,
      durationMs,
      stateSnapshot: this.getSnapshot()
    });

    if (output.thought) {
      this.appendMessage({
        type: 'thought',
        content: output.thought
      });
    }

    const firstCall = output.calls[0];

    // Se l'agente emette l'azione speciale di abort
    if (firstCall && firstCall.name === 'a_abort_call') {
      this.appendMessage({
        type: 'action',
        callId: firstCall.id,
        content: { name: 'a_abort_call', payload: {} }
      });

      this.appendMessage({
        type: 'result',
        callId: firstCall.id,
        content: { status: 'aborted', target: this.targetRepairToolId ?? null }
      });

      this.targetRepairToolId = undefined;
      this.targetRepairCallId = undefined;
      this.transitionTo('q_exec', 'repair_abort');
      this.t++;

      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // Se l'agente riprova a emettere il tool target corretto
    if (firstCall && firstCall.name === this.targetRepairToolId) {
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

          this.targetRepairToolId = undefined;
          this.targetRepairCallId = undefined;
          this.t++;
          this.transitionTo('q_halt', 'exec_term_success', { toolId: firstCall.name });
          this.lastHaltResult = {
            type: firstCall.name,
            payload: parsed.data as T
          };

          void this.emitEvent({
            type: 'halt',
            timestamp: new Date(),
            macroCycle: this.c,
            tick: this.t,
            result: this.lastHaltResult,
            stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
          });

          return {
            status: 'halt',
            macroCycle: this.c,
            tick: this.t,
            result: this.lastHaltResult,
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
              content: { name: firstCall.name, payload: parsed.data as DataRecord }
            });

            this.targetRepairToolId = undefined;
            this.targetRepairCallId = undefined;
            this.t++;
            this.transitionTo('q_yield', 'exec_world_yield');

            const validCall: ToolCall = {
              id: firstCall.id,
              name: firstCall.name,
              payload: parsed.data as DataRecord
            };

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
      controlState: this.controlState,
      macroCycle: this.c,
      tick: this.t,
      state: this.state
    };
  }

  /**
   * Esegue step() continui finché non si cede il controllo (yield) o si termina (halt).
   */
  public async resume(maxSteps: number = 500): Promise<ExecutionOutcome<T>> {
    let steps = 0;
    while (true) {
      if (++steps > maxSteps) {
        throw new Error(
          `Raggiunto limite massimo di step (${maxSteps}) durante resume() senza raggiungere yield o halt.`
        );
      }
      const outcome = await this.step();
      if (outcome.status === 'yield' || outcome.status === 'halt') {
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
        this.feedPayload({ userContent: options.userContent });
      }

      while (true) {
        if (this.c > maxMacroCycles) {
          throw new Error(`Raggiunto limite massimo di macro-cicli (${maxMacroCycles}).`);
        }
        if (this.t > maxTicks) {
          throw new Error(`Raggiunto limite massimo di tick decisionali (${maxTicks}).`);
        }

        const outcome = await this.resume();

        if (options?.onMacroCycle) {
          await options.onMacroCycle(this.c, outcome);
        }

        if (outcome.status === 'halt') {
          return {
            result: outcome.result,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        // Dispatch asincrono in parallelo dei tool di mondo in q_yield
        const worldResults = await Promise.all(
          outcome.pendingCalls.map(async (call) => {
            if (options?.beforeToolExecution) {
              await options.beforeToolExecution(call.name, call.payload);
            }
            const startTime = Date.now();
            const res = await this.world.executeTool(call.name, call.payload);
            const durationMs = Date.now() - startTime;

            void this.emitEvent({
              type: 'world_action',
              timestamp: new Date(),
              macroCycle: this.c,
              tick: this.t,
              toolId: call.name,
              args: call.payload,
              result: res,
              durationMs
            });

            if (options?.afterToolExecution) {
              await options.afterToolExecution(call.name, call.payload, res);
            }
            return { callId: call.id, result: res };
          })
        );

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
