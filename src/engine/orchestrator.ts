import { LanguageModelAdapter } from '../adapters/index.js';
import { AgentEvent, AgentObserver, CompositeObserver } from '../observability/index.js';
import {
  AgentManifest,
  AgentState,
  CanonicalCognitiveActionId,
  CognitiveMetadataMap,
  CognitiveTool,
  CognitiveToolkit,
  CognitiveValidationMessages,
  Directive,
  ExitResult,
  FSMControlState,
  InferenceTriple,
  Message,
  SchemaErrorKind,
  ToolCall,
  ToolDefinition
} from '../types/index.js';
import { WorldRegistry } from '../world/index.js';
import { executeCognitiveTool } from './introspective-universe.js';
import { computeVisibleTools, SystemFrameProjector } from './projection.js';

/**
 * ============================================================================
 * PAYLOAD ESOGENO DI RISVEGLIO DEL MONDO: P_c
 * ============================================================================
 */
export interface WakeupPayload {
  userContent?: unknown;
  worldResults?: Array<{ callId: string; result: unknown }>;
}

export type { FSMControlState } from '../types/index.js';

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

export type HaltStepOutcome = {
  status: 'halt';
  macroCycle: number;
  tick: number;
  result: ExitResult;
  state: AgentState;
};

/**
 * Esito di una singola micro-transizione (step)
 */
export type StepOutcome = RunningStepOutcome | YieldStepOutcome | HaltStepOutcome;

/**
 * Esito di una sequenza continuativa fino al rilascio del controllo (yield o halt)
 */
export type ExecutionOutcome = YieldStepOutcome | HaltStepOutcome;

/**
 * Opzioni di configurazione per l'esecuzione autonoma end-to-end (run)
 */
export interface RunOptions {
  /**
   * Messaggio o contenuto esogeno iniziale dell'utente (se non già inviato)
   */
  userContent?: unknown;

  /**
   * Limite massimo di macro-cicli c consentiti prima di interrompere (default: 50).
   * Protegge da loop infiniti di chiamate al Mondo W.
   */
  maxMacroCycles?: number;

  /**
   * Limite massimo di micro-passi decisionali t consentiti (default: 250).
   */
  maxTicks?: number;

  /**
   * Osservatori (logger, raccoglitori telemetria, streaming) agganciati a questa esecuzione
   */
  observers?: AgentObserver[];

  /**
   * Hook opzionale eseguito al completamento di ogni macro-ciclo c (quando cede il controllo per yield o termina in halt)
   */
  onMacroCycle?: (macroCycle: number, outcome: ExecutionOutcome) => void | Promise<void>;

  /**
   * Hook opzionale eseguito prima dell'invocazione di ciascun tool fisico verso il Mondo W
   */
  beforeToolExecution?: (toolId: string, args: unknown) => void | Promise<void>;

  /**
   * Hook opzionale eseguito dopo che un tool fisico del Mondo W ha restituito il proprio esito
   */
  afterToolExecution?: (toolId: string, args: unknown, result: unknown) => void | Promise<void>;
}

/**
 * Risultato finale dell'esecuzione autonoma end-to-end (fino all'arresto q_halt)
 */
export interface RunResult<T = any> {
  result: ExitResult<T>;
  macroCycles: number;
  ticks: number;
  state: AgentState;
}

/**
 * ============================================================================
 * POLICY DEL FRAMEWORK (Livello 1)
 * ============================================================================
 */
export interface OrchestratorPolicy {
  formatDirectivePrompt(type: 'start_intro' | 'loop_intro' | 'start_exec'): string;
  formatSchemaErrorPrompt(targetToolId: string, errorDetail: string): string;
  formatDirectiveMessageContent(directive: Directive): string | Record<string, unknown>;
  formatAbortResultContent(targetToolId: string): unknown;
  formatVoidResultContent(): unknown;
  formatControlActionDescription(action: 'a_concludi_intro' | 'a_abort_call'): string;
  formatInternalErrorDetail(kind: SchemaErrorKind, context?: { toolId?: string }): string;
  validationMessages: CognitiveValidationMessages;
  cognitiveMetadata: CognitiveMetadataMap;
}

/**
 * ============================================================================
 * CONFIGURAZIONE DEL LIVELLO 1: IL FRAMEWORK IMMUTABILE (Ω)
 * ============================================================================
 * Agnostico rispetto al dominio di business (W) e all'identità dell'agente (M).
 */
export interface FrameworkConfig {
  cognitiveTools: CognitiveToolkit;
  systemFrameProjector: SystemFrameProjector;
  policy: OrchestratorPolicy;
  observers?: AgentObserver[];
}

/**
 * ============================================================================
 * CLASSE LIVELLO 1: FrameworkEngine (Il Motore di Transizione Immutabile)
 * ============================================================================
 */
export class FrameworkEngine {
  constructor(private readonly config: FrameworkConfig) {}

  /**
   * RILEGATURA AL LIVELLO 2: Il Mondo (Dominio Aziendale W)
   * Riceve il registro degli strumenti fisici e restituisce il Runtime operativo.
   */
  public bindWorld(world: WorldRegistry): BoundRuntime {
    return new BoundRuntime(this.config, world);
  }
}

/**
 * ============================================================================
 * CLASSE LIVELLO 2: BoundRuntime (Ambiente Aziendale Rilegato a W)
 * ============================================================================
 * Conosce le leggi del framework e il catalogo degli strumenti fisici W.
 * È pronta a istanziare molteplici agenti diversi a Livello 3.
 */
export class BoundRuntime {
  private observers: AgentObserver[] = [];

  constructor(
    private readonly frameworkConfig: FrameworkConfig,
    private readonly world: WorldRegistry
  ) {}

  /**
   * Registra un osservatore globale su tutti gli agenti spawnati da questo runtime.
   */
  public addObserver(observer: AgentObserver): void {
    this.observers.push(observer);
  }

  /**
   * ISTANZIAZIONE DI LIVELLO 3: Spawna una singola sessione agente dal Manifesto.
   */
  public spawnAgent(manifest: AgentManifest, model: LanguageModelAdapter): AgentInstance {
    const agent = new AgentInstance(this.frameworkConfig, this.world, manifest, model);
    for (const obs of this.observers) {
      agent.addObserver(obs);
    }
    return agent;
  }

  /**
   * ESECUZIONE AUTONOMA END-TO-END DI LIVELLO 3:
   * Spawna l'agente ed esegue il loop completo consumando autonomamente le chiamate
   * al Mondo W fino all'arresto formale q_halt.
   */
  public async runAgent<T = any>(
    manifest: AgentManifest,
    model: LanguageModelAdapter,
    options?: RunOptions
  ): Promise<RunResult<T>> {
    const agent = this.spawnAgent(manifest, model);
    return await agent.run<T>(options);
  }
}

/**
 * ============================================================================
 * CLASSE LIVELLO 3: AgentInstance (Sessione Attiva dell'Automa FSM M_FSM)
 * ============================================================================
 */
export class AgentInstance {
  private state: AgentState;
  private c: number = 0; // Macro-Ciclo del Mondo
  private t: number = 0; // Tick decisionale di inferenza

  // Tracciamento FSM esplicito
  private controlState: FSMControlState = 'q_sleep';
  private currentDirective: Directive | null = null;
  private repairPhase: 'intro' | 'exec' | null = null;
  private lastHaltResult: ExitResult | null = null;

  // Mappe bidirezionali di traduzione simbolica (Manifesto <-> LLM-facing)
  private toolNameToCanonical: Map<string, CanonicalCognitiveActionId> = new Map();
  private canonicalToToolName: Map<CanonicalCognitiveActionId, string> = new Map();
  private normalizedAInt: Set<string>;
  private compositeObserver: CompositeObserver = new CompositeObserver();

  constructor(
    private readonly framework: FrameworkConfig,
    private readonly world: WorldRegistry,
    private readonly manifest: AgentManifest,
    private readonly model: LanguageModelAdapter
  ) {
    this.normalizedAInt =
      this.manifest.A_int instanceof Set
        ? this.manifest.A_int
        : new Set(this.manifest.A_int);

    // Registrazione osservatori di livello 1 definiti nel framework
    if (this.framework.observers) {
      for (const obs of this.framework.observers) {
        this.compositeObserver.addObserver(obs);
      }
    }

    // Inizializzazione delle mappe di traduzione simbolica
    for (const [canonicalId, meta] of Object.entries(this.framework.policy.cognitiveMetadata ?? {})) {
      this.toolNameToCanonical.set(meta.toolName, canonicalId as CanonicalCognitiveActionId);
      this.canonicalToToolName.set(canonicalId as CanonicalCognitiveActionId, meta.toolName);
    }

    // Inizializzazione dello Stato S_0 a partire dal Manifesto
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

  /**
   * Registra un osservatore (logger, collezionista telemetria, streaming UI).
   */
  public addObserver(observer: AgentObserver): void {
    this.compositeObserver.addObserver(observer);
  }

  /**
   * Rimuove un osservatore registrato.
   */
  public removeObserver(observer: AgentObserver): void {
    this.compositeObserver.removeObserver(observer);
  }

  /**
   * Emette un evento di telemetria a tutti gli osservatori registrati.
   */
  public async emitEvent(event: AgentEvent): Promise<void> {
    await this.compositeObserver.onEvent(event);
  }

  /**
   * Gestisce le transizioni di stato FSM emettendo l'evento corrispondente.
   */
  private transitionTo(newState: FSMControlState, reason?: string): void {
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
        reason
      });
    }
  }

  public getState(): Readonly<AgentState> {
    return this.state;
  }

  public getTimeIndex(): { c: number; t: number } {
    return { c: this.c, t: this.t };
  }

  public getControlState(): FSMControlState {
    return this.controlState;
  }

  public getCurrentDirective(): Readonly<Directive> | null {
    return this.currentDirective;
  }

  public canStep(): boolean {
    return this.controlState !== 'q_halt' && this.controlState !== 'q_sleep';
  }

  /**
   * Consente di forzare/ripristinare lo stato di controllo e la direttiva corrente
   * (utile per checkpointing, de-serializzazione, o avvii controllati).
   */
  public setControlState(state: FSMControlState, directive?: Directive): void {
    this.transitionTo(state, 'forzatura manuale');
    if (directive) {
      this.currentDirective = directive;
    }
  }

  /**
   * Accoda il payload esogeno P_c e attiva il router G_Ω
   * portando l'automa dallo stato di sonno (q_sleep) allo stato operativo iniziale
   * (q_intro o q_exec).
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

    // 1. Accodamento risultati del mondo (E_world)
    if (payload.worldResults && payload.worldResults.length > 0) {
      for (const wr of payload.worldResults) {
        this.appendMessage({
          role: 'world',
          channel: 'result',
          callId: wr.callId,
          content: wr.result
        });
      }
    }

    // 2. Accodamento input esogeno utente (E_user)
    if (payload.userContent) {
      this.appendMessage({
        role: 'user',
        channel: 'payload',
        content: payload.userContent
      });
    }

    // 3. Router G_Ω
    if (this.normalizedAInt.size > 0) {
      this.transitionTo('q_intro', 'router G_Ω (A_int presente)');
      this.currentDirective = {
        type: 'start_intro',
        prompt: this.framework.policy.formatDirectivePrompt('start_intro')
      };
    } else {
      this.transitionTo('q_exec', 'router G_Ω (agente reattivo)');
      this.currentDirective = {
        type: 'start_exec',
        prompt: this.framework.policy.formatDirectivePrompt('start_exec')
      };
    }
  }

  /**
   * Risveglio rapido end-to-end:
   * Accoda il payload ed esegue l'automa fino alla sospensione (yield) o arresto (halt).
   */
  public async wakeup(payload: WakeupPayload): Promise<ExecutionOutcome> {
    this.feedPayload(payload);
    return await this.resume();
  }

  /**
   * Esegue la computazione in continuo fino a quando l'agente non cede il controllo
   * (status === 'yield') o termina definitivamente (status === 'halt').
   */
  public async resume(): Promise<ExecutionOutcome> {
    while (true) {
      const outcome = await this.step();
      if (outcome.status === 'yield' || outcome.status === 'halt') {
        return outcome;
      }
    }
  }

  /**
   * ESECUZIONE AUTONOMA END-TO-END (Completamento fino a q_halt):
   * Consuma autonomamente i macro-cicli: quando l'agente emette chiamate fisiche
   * verso il Mondo W (yield), le esegue automaticamente contro il WorldRegistry,
   * ne raccoglie i risultati e risveglia l'agente (wakeup) fino al raggiungimento di q_halt.
   */
  public async run<T = any>(options?: RunOptions): Promise<RunResult<T>> {
    const maxMacroCycles = options?.maxMacroCycles ?? 50;
    const maxTicks = options?.maxTicks ?? 250;

    // Registrazione osservatori specifici di questa corsa
    if (options?.observers) {
      for (const obs of options.observers) {
        this.addObserver(obs);
      }
    }

    try {
      // 1. Invio del contenuto utente se fornito
      if (options?.userContent !== undefined) {
        this.feedPayload({ userContent: options.userContent });
      } else if (this.controlState === 'q_sleep') {
        // Se è dormiente e non ci sono input utente, invia payload vuoto per attivare il router G_Ω
        this.feedPayload({});
      }

      // 2. Loop autonomo multi-ciclo
      while (true) {
        if (this.c > maxMacroCycles) {
          throw new Error(
            `Raggiunto il limite massimo di ${maxMacroCycles} macro-cicli del Mondo senza arresto (q_halt). Possibile loop infinito.`
          );
        }
        if (this.t > maxTicks) {
          throw new Error(
            `Raggiunto il limite massimo di ${maxTicks} passi decisionali (tick) senza arresto (q_halt).`
          );
        }

        const outcome = await this.resume();

        if (options?.onMacroCycle) {
          await options.onMacroCycle(this.c, outcome);
        }

        // Se l'agente ha terminato con un contratto A_term
        if (outcome.status === 'halt') {
          return {
            result: outcome.result as ExitResult<T>,
            macroCycles: this.c,
            ticks: this.t,
            state: this.state
          };
        }

        // Se l'agente ha ceduto il controllo per eseguire tool fisici verso W (yield)
        const worldResults = await Promise.all(
          outcome.pendingCalls.map(async (call) => {
            if (options?.beforeToolExecution) {
              await options.beforeToolExecution(call.name, call.payload);
            }
            const startTime = Date.now();
            try {
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
            } catch (err: any) {
              const durationMs = Date.now() - startTime;
              const errorResult = {
                error: true,
                message: err?.message ?? String(err),
                details: err?.details
              };

              void this.emitEvent({
                type: 'world_action',
                timestamp: new Date(),
                macroCycle: this.c,
                tick: this.t,
                toolId: call.name,
                args: call.payload,
                error: errorResult,
                durationMs
              });

              if (options?.afterToolExecution) {
                await options.afterToolExecution(call.name, call.payload, errorResult);
              }
              return { callId: call.id, result: errorResult };
            }
          })
        );

        // Risveglio dell'agente con i risultati raccolti dal Mondo W
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

  /**
   * Avanza la computazione di esattamente UN singolo passo decisionale (tick t).
   * Rispetta rigorosamente la funzione di transizione globale Δ_trans.
   */
  public async step(): Promise<StepOutcome> {
    if (this.currentDirective) {
      void this.emitEvent({
        type: 'step_start',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        controlState: this.controlState,
        directive: this.currentDirective
      });
    }

    switch (this.controlState) {
      case 'q_sleep': {
        throw new Error(
          "L'agente si trova in stato 'q_sleep' (dormiente). Usa 'feedPayload(payload)' o 'wakeup(payload)' per inviare un input, oppure imposta uno stato di ripresa con 'setControlState()'."
        );
      }

      case 'q_halt': {
        return {
          status: 'halt',
          macroCycle: this.c,
          tick: this.t,
          result: this.lastHaltResult!,
          state: this.state
        };
      }

      case 'q_intro': {
        return await this.stepIntro();
      }

      case 'q_exec': {
        return await this.stepExec();
      }

      case 'q_repair': {
        return await this.stepRepair();
      }

      case 'q_yield': {
        // q_yield è uno stato transitorio verso q_sleep
        this.transitionTo('q_sleep', 'transizione post-yield verso riposo');
        throw new Error(
          "L'agente ha completato lo yield verso il mondo ed è ora in 'q_sleep'. Attendere i risultati del mondo."
        );
      }
    }
  }

  /**
   * Micro-passo nel Loop Introspettivo (Φ_intro)
   */
  private async stepIntro(): Promise<StepOutcome> {
    if (!this.currentDirective) {
      this.currentDirective = {
        type: 'start_intro',
        prompt: this.framework.policy.formatDirectivePrompt('start_intro')
      };
    }

    this.appendDirectiveMessage(this.currentDirective);

    const context = this.buildInferenceTriple(this.currentDirective);
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.controlState,
      directive: this.currentDirective,
      context,
      output,
      durationMs
    });

    if (output.thought) {
      this.appendMessage({
        role: 'agent',
        channel: 'thought',
        content: output.thought
      });
    }

    const calls = output.calls;

    // Violazione: nessuna azione emessa in intro
    if (calls.length === 0) {
      const detail = this.framework.policy.formatInternalErrorDetail('no_action_in_intro');
      this.currentDirective = {
        type: 'err_schema',
        targetToolId: 'a_concludi_intro',
        schemaErrorDetail: detail,
        prompt: this.framework.policy.formatSchemaErrorPrompt('a_concludi_intro', detail)
      };
      this.transitionTo('q_repair', 'nessuna azione emessa in fase introspettiva');
      this.repairPhase = 'intro';
      this.t++;
      void this.emitEvent({
        type: 'schema_error',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        targetToolId: 'a_concludi_intro',
        errorDetail: detail,
        recoveryDirective: this.currentDirective
      });
      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    const hasConcludi = calls.some((c) => c.name === 'a_concludi_intro');
    const hasOtherCalls = calls.some((c) => c.name !== 'a_concludi_intro');

    // Violazione XOR
    if (hasConcludi && hasOtherCalls) {
      const detail = this.framework.policy.formatInternalErrorDetail('xor_concludi_violation');
      this.currentDirective = {
        type: 'err_schema',
        targetToolId: 'a_concludi_intro',
        schemaErrorDetail: detail,
        prompt: this.framework.policy.formatSchemaErrorPrompt('a_concludi_intro', detail)
      };
      this.transitionTo('q_repair', 'violazione vincolo XOR su a_concludi_intro');
      this.repairPhase = 'intro';
      this.t++;
      void this.emitEvent({
        type: 'schema_error',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        targetToolId: 'a_concludi_intro',
        errorDetail: detail,
        recoveryDirective: this.currentDirective
      });
      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // SOTTOCASO 2: Chiusura Introspettiva -> Transizione a q_exec
    if (hasConcludi && !hasOtherCalls) {
      this.appendMessage({
        role: 'agent',
        channel: 'call',
        callId: calls[0].id,
        content: 'a_concludi_intro()'
      });

      this.t++;
      this.transitionTo('q_exec', 'chiusura introspettiva via a_concludi_intro');
      this.currentDirective = {
        type: 'start_exec',
        prompt: this.framework.policy.formatDirectivePrompt('start_exec')
      };

      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // SOTTOCASO 1: Continuazione Introspettiva (X_k ⊆ A_int)
    for (const call of calls) {
      // Risoluzione della chiamata dall'identificatore LLM-facing alla costante simbolica del Manifesto
      const canonicalId =
        this.toolNameToCanonical.get(call.name) ??
        (call.name as CanonicalCognitiveActionId);

      if (!this.normalizedAInt.has(canonicalId)) {
        const detail = this.framework.policy.formatInternalErrorDetail(
          'unauthorized_cognitive_action',
          { toolId: call.name }
        );
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: call.name,
          schemaErrorDetail: detail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(call.name, detail)
        };
        this.transitionTo('q_repair', `azione cognitiva non autorizzata: ${call.name}`);
        this.repairPhase = 'intro';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          errorDetail: detail,
          recoveryDirective: this.currentDirective
        });
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const tool = this.framework.cognitiveTools[canonicalId];
      if (!tool) {
        const detail = this.framework.policy.formatInternalErrorDetail(
          'unregistered_cognitive_action',
          { toolId: call.name }
        );
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: call.name,
          schemaErrorDetail: detail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(call.name, detail)
        };
        this.transitionTo('q_repair', `azione cognitiva non registrata: ${call.name}`);
        this.repairPhase = 'intro';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          errorDetail: detail,
          recoveryDirective: this.currentDirective
        });
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      this.appendMessage({
        role: 'agent',
        channel: 'call',
        callId: call.id,
        content: call.payload
      });

      const execResult = await executeCognitiveTool(tool, call.payload, this.state);

      if (!execResult.success) {
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: call.name,
          schemaErrorDetail: execResult.errorDetail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(call.name, execResult.errorDetail)
        };
        this.transitionTo('q_repair', `errore parametri tool cognitivo: ${call.name}`);
        this.repairPhase = 'intro';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          errorDetail: execResult.errorDetail,
          recoveryDirective: this.currentDirective
        });
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      const content =
        execResult.result !== undefined
          ? execResult.result
          : this.framework.policy.formatVoidResultContent();

      this.appendMessage({
        role: 'orchestrator',
        channel: 'result',
        callId: call.id,
        content
      });

      void this.emitEvent({
        type: 'cognitive_action',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        toolName: call.name,
        canonicalId,
        args: call.payload,
        result: content,
        stateSnapshot: { ...this.state, Ds: { ...this.state.Ds } }
      });
    }

    this.t++;
    this.currentDirective = {
      type: 'loop_intro',
      prompt: this.framework.policy.formatDirectivePrompt('loop_intro')
    };

    return {
      status: 'running',
      controlState: this.controlState,
      macroCycle: this.c,
      tick: this.t,
      state: this.state
    };
  }

  /**
   * Micro-passo nel Loop Esecutivo (Φ_exec)
   */
  private async stepExec(): Promise<StepOutcome> {
    if (!this.currentDirective) {
      this.currentDirective = {
        type: 'start_exec',
        prompt: this.framework.policy.formatDirectivePrompt('start_exec')
      };
    }

    this.appendDirectiveMessage(this.currentDirective);

    const context = this.buildInferenceTriple(this.currentDirective);
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.controlState,
      directive: this.currentDirective,
      context,
      output,
      durationMs
    });

    if (output.thought) {
      this.appendMessage({
        role: 'agent',
        channel: 'thought',
        content: output.thought
      });
    }

    const calls = output.calls;
    if (calls.length === 0) {
      const detail = this.framework.policy.formatInternalErrorDetail('no_call_in_exec');
      this.currentDirective = {
        type: 'err_schema',
        targetToolId: 'exec',
        schemaErrorDetail: detail,
        prompt: this.framework.policy.formatSchemaErrorPrompt('exec', detail)
      };
      this.transitionTo('q_repair', 'nessuna azione o chiamata emessa in fase esecutiva');
      this.repairPhase = 'exec';
      this.t++;
      void this.emitEvent({
        type: 'schema_error',
        timestamp: new Date(),
        macroCycle: this.c,
        tick: this.t,
        targetToolId: 'exec',
        errorDetail: detail,
        recoveryDirective: this.currentDirective
      });
      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }

    // Terminazione tipizzata (A_term)
    const termCall = calls.find((c) =>
      this.manifest.A_term.some((term) => term.id === c.name)
    );

    if (termCall) {
      const termContract = this.manifest.A_term.find((term) => term.id === termCall.name)!;
      const parsed = termContract.schema.safeParse(termCall.payload);

      if (!parsed.success) {
        const detail = JSON.stringify(parsed.error.format());
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: termCall.name,
          schemaErrorDetail: detail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(termCall.name, detail)
        };
        this.transitionTo('q_repair', `violazione schema contratto terminazione: ${termCall.name}`);
        this.repairPhase = 'exec';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: termCall.name,
          errorDetail: detail,
          recoveryDirective: this.currentDirective
        });
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      this.appendMessage({
        role: 'agent',
        channel: 'call',
        callId: termCall.id,
        content: parsed.data
      });

      this.t++;
      this.transitionTo('q_halt', `terminazione con contratto ${termCall.name}`);
      this.lastHaltResult = {
        type: termCall.name,
        payload: parsed.data
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

    // Azioni sul Mondo (Y ⊆ Ta)
    const validWorldCalls: ToolCall[] = [];

    for (const call of calls) {
      if (!this.state.Ta.has(call.name)) {
        const detail = this.framework.policy.formatInternalErrorDetail('unmounted_world_tool', {
          toolId: call.name
        });
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: call.name,
          schemaErrorDetail: detail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(call.name, detail)
        };
        this.transitionTo('q_repair', `tool fisico non montato: ${call.name}`);
        this.repairPhase = 'exec';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          errorDetail: detail,
          recoveryDirective: this.currentDirective
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
        throw new Error(`Tool fisico '${call.name}' non registrato nel registro del Mondo W.`);
      }

      const parsed = worldDef.parameters.safeParse(call.payload);
      if (!parsed.success) {
        const detail = JSON.stringify(parsed.error.format());
        this.currentDirective = {
          type: 'err_schema',
          targetToolId: call.name,
          schemaErrorDetail: detail,
          prompt: this.framework.policy.formatSchemaErrorPrompt(call.name, detail)
        };
        this.transitionTo('q_repair', `errore parametri tool fisico: ${call.name}`);
        this.repairPhase = 'exec';
        this.t++;
        void this.emitEvent({
          type: 'schema_error',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          targetToolId: call.name,
          errorDetail: detail,
          recoveryDirective: this.currentDirective
        });
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      }

      this.appendMessage({
        role: 'agent',
        channel: 'call',
        callId: call.id,
        content: parsed.data
      });

      validWorldCalls.push({
        id: call.id,
        name: call.name,
        payload: parsed.data
      });
    }

    // YIELD: Ibernazione e incremento c
    this.t++;
    this.c++;
    this.transitionTo('q_sleep', 'cessione controllo (yield) in attesa del Mondo W');

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
   * Micro-passo nello Stato di Riparazione (q_repair)
   */
  private async stepRepair(): Promise<StepOutcome> {
    if (!this.currentDirective) {
      throw new Error("Impossibile eseguire stepRepair senza una direttiva d'errore attiva.");
    }

    this.appendDirectiveMessage(this.currentDirective);

    const context = this.buildInferenceTriple(this.currentDirective);
    const startInfer = Date.now();
    const output = await this.model.infer(context);
    const durationMs = Date.now() - startInfer;

    void this.emitEvent({
      type: 'model_inference',
      timestamp: new Date(),
      macroCycle: this.c,
      tick: this.t,
      controlState: this.controlState,
      directive: this.currentDirective,
      context,
      output,
      durationMs
    });

    if (output.thought) {
      this.appendMessage({
        role: 'agent',
        channel: 'thought',
        content: output.thought
      });
    }

    const call = output.calls[0];

    // Sottocaso 1: Abort esplicito (a_abort_call)
    if (call && call.name === 'a_abort_call') {
      const targetId =
        this.currentDirective.type === 'err_schema'
          ? this.currentDirective.targetToolId
          : 'unknown';

      this.appendMessage({
        role: 'agent',
        channel: 'call',
        callId: call.id,
        content: 'a_abort_call()'
      });

      this.appendMessage({
        role: 'orchestrator',
        channel: 'result',
        callId: call.id,
        content: this.framework.policy.formatAbortResultContent(targetId)
      });

      this.t++;

      if (this.repairPhase === 'intro') {
        this.transitionTo('q_intro', 'recupero completato con abort');
        this.currentDirective = {
          type: 'loop_intro',
          prompt: this.framework.policy.formatDirectivePrompt('loop_intro')
        };
        return {
          status: 'running',
          controlState: this.controlState,
          macroCycle: this.c,
          tick: this.t,
          state: this.state
        };
      } else {
        // Abort da exec: consuma il ciclo e va in yield a vuoto
        this.c++;
        this.transitionTo('q_sleep', 'recupero completato con abort da exec');
        void this.emitEvent({
          type: 'yield',
          timestamp: new Date(),
          macroCycle: this.c,
          tick: this.t,
          pendingCalls: []
        });
        return {
          status: 'yield',
          macroCycle: this.c,
          tick: this.t,
          pendingCalls: [],
          state: this.state
        };
      }
    }

    // Sottocaso 2: Tentativo di correzione
    this.t++;

    if (this.repairPhase === 'intro') {
      this.transitionTo('q_intro', 'ritorno a intro dopo correzione');
      this.currentDirective = {
        type: 'loop_intro',
        prompt: this.framework.policy.formatDirectivePrompt('loop_intro')
      };
      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    } else {
      this.transitionTo('q_exec', 'ritorno a exec dopo correzione');
      this.currentDirective = {
        type: 'start_exec',
        prompt: this.framework.policy.formatDirectivePrompt('start_exec')
      };
      return {
        status: 'running',
        controlState: this.controlState,
        macroCycle: this.c,
        tick: this.t,
        state: this.state
      };
    }
  }

  private buildInferenceTriple(directive: Directive): InferenceTriple {
    const systemFrame = this.framework.systemFrameProjector(directive, this.state);

    const allWorldDefs = new Map<string, ToolDefinition>();
    for (const def of this.world.getAllDefinitions()) {
      allWorldDefs.set(def.id, def);
    }

    const visibleTools = computeVisibleTools(
      directive,
      this.state,
      this.manifest,
      this.framework.cognitiveTools,
      allWorldDefs,
      this.framework.policy
    );

    return {
      systemFrame,
      messages: [...this.state.Ep],
      visibleTools
    };
  }

  private appendMessage(msg: Omit<Message, 'index' | 'tau'>): void {
    const fullMessage: Message = {
      index: this.state.Ep.length,
      tau: { c: this.c, t: this.t },
      ...msg
    };
    this.state.Ep.push(fullMessage);
  }

  private appendDirectiveMessage(directive: Directive): void {
    this.appendMessage({
      role: 'orchestrator',
      channel: 'directive',
      content: this.framework.policy.formatDirectiveMessageContent(directive)
    });
  }
}
