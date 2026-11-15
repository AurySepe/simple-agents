import {
  AgentInstance,
  FrameworkEngine,
  RunOptions,
  RunResult,
  RecoveryContext,
  RecoveryDecision,
  OrchestratorRecoveryConfig
} from '../engine/orchestrator.js';
import { DataValue, LanguageModelAdapter, UnexpectedModelError } from '../types/index.js';
import { createDefaultFrameworkConfig } from '../defaults/index.js';
import {
  AgentBlueprint,
  AgentRunnerResult,
  AfterToolUseInterceptor,
  BeforeToolUseInterceptor,
  ImplementedAgent,
  TypedAgentState,
  WorldExecutionError,
  ModelExecutionError
} from './types.js';
import { EvaluationCollector } from '../observability/collectors/evaluation-collector.js';
import { UnexpectedToolError } from '../world/index.js';

type InferAgentRunnerResult<TAgent, TModel> = TAgent extends AgentBlueprint<
  any,
  any,
  infer TTerminations,
  infer TToolErrorsMap,
  any
>
  ? TModel extends LanguageModelAdapter<infer TModelErrors>
    ? AgentRunnerResult<TTerminations, TToolErrorsMap, TModelErrors>
    : AgentRunnerResult<TTerminations, TToolErrorsMap, any>
  : AgentRunnerResult<any, any, any>;

type ExtractBlueprintWorld<TAgent> = TAgent extends AgentBlueprint<any, any, any, any, infer TWorld>
  ? TWorld
  : undefined;

type ExtractBlueprintStateSchema<TAgent> = TAgent extends AgentBlueprint<any, infer TStateSchema, any, any, any>
  ? TStateSchema
  : undefined;

export interface TypedRunnerRecoveryConfig<TToolErrorsMap extends Record<string, any>, TModelErrors> {
  onModelError?: (
    error: TModelErrors | UnexpectedModelError,
    context: RecoveryContext
  ) => Promise<RecoveryDecision> | RecoveryDecision;

  onToolError?: {
    [K in keyof TToolErrorsMap]?: (
      error: TToolErrorsMap[K] | UnexpectedToolError,
      context: RecoveryContext
    ) => Promise<RecoveryDecision> | RecoveryDecision;
  };
}

/**
 * ============================================================================
 * TYPE-STATE BUILDER: RunnerBuilder
 * ============================================================================
 * Builder immutabile e fortemente tipizzato per orchestrare ed eseguire agenti.
 * Attua il Type-State Pattern: .run() e .spawn() sono invocabili solo quando
 * i componenti essenziali (Engine, Model, Agent) sono stati forniti al compilatore.
 */
export class RunnerBuilder<
  TEngine extends FrameworkEngine | undefined = undefined,
  TModel extends LanguageModelAdapter<any> | undefined = undefined,
  TAgent extends AgentBlueprint<any, any, any, any, any> | undefined = undefined,
  TOptions extends RunOptions<DataValue> = RunOptions<DataValue>,
  TWorld = undefined,
  THasWorld extends boolean = false
> {
  constructor(
    private readonly state: {
      engine?: FrameworkEngine;
      model?: LanguageModelAdapter<any>;
      agent?: AgentBlueprint<any, any, any, any, any>;
      world?: TWorld;
      options?: RunOptions<DataValue>;
      beforeToolUse?: BeforeToolUseInterceptor<any, any>[];
      afterToolUse?: AfterToolUseInterceptor<any, any>[];
    }
  ) {}

  /**
   * Associa o sovrascrive il FrameworkEngine di Livello 1.
   */
  public withEngine(
    engine: FrameworkEngine
  ): RunnerBuilder<FrameworkEngine, TModel, TAgent, TOptions, TWorld, THasWorld> {
    return new RunnerBuilder({
      ...this.state,
      engine
    });
  }

  /**
   * Associa o sovrascrive l'adapter del modello linguistico (LLM).
   */
  public withModel<M extends LanguageModelAdapter<any>>(
    model: M
  ): RunnerBuilder<TEngine, M, TAgent, TOptions, TWorld, THasWorld> {
    return new RunnerBuilder({
      ...this.state,
      model
    });
  }

  /**
   * Associa il blueprint dell'agente da eseguire (Fase 1).
   * Se il blueprint richiede un TWorld diverso da undefined, è necessario chiamare .withWorld(world).
   */
  public withAgent<A extends AgentBlueprint<any, any, any, any, any>>(
    agent: A
  ): RunnerBuilder<
    TEngine,
    TModel,
    A,
    TOptions,
    ExtractBlueprintWorld<A>,
    ExtractBlueprintWorld<A> extends undefined ? true : false
  > {
    return new RunnerBuilder({
      ...this.state,
      agent,
      world: undefined
    }) as unknown as RunnerBuilder<
      TEngine,
      TModel,
      A,
      TOptions,
      ExtractBlueprintWorld<A>,
      ExtractBlueprintWorld<A> extends undefined ? true : false
    >;
  }

  /**
   * Collega l'istanza concreta del mondo condiviso al blueprint dell'agente (Fase 2).
   */
  public withWorld(
    world: TWorld
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, true> {
    return new RunnerBuilder({
      ...this.state,
      world
    });
  }

  /**
   * Registra un interceptor puro eseguito prima di ogni tool call.
   * Può essere chiamato più volte per comporre una pipeline in ordine di registrazione.
   */
  public beforeToolUse(
    interceptor: BeforeToolUseInterceptor<ExtractBlueprintStateSchema<TAgent>, TWorld>
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld> {
    return new RunnerBuilder({
      ...this.state,
      beforeToolUse: [...(this.state.beforeToolUse ?? []), interceptor as BeforeToolUseInterceptor<any, any>]
    });
  }

  /**
   * Registra un interceptor puro eseguito dopo ogni tool call riuscita.
   * Può essere chiamato più volte per comporre una pipeline in ordine di registrazione.
   */
  public afterToolUse(
    interceptor: AfterToolUseInterceptor<ExtractBlueprintStateSchema<TAgent>, TWorld>
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld> {
    return new RunnerBuilder({
      ...this.state,
      afterToolUse: [...(this.state.afterToolUse ?? []), interceptor as AfterToolUseInterceptor<any, any>]
    });
  }

  /**
   * Configura una recovery policy dichiarativa fortemente tipizzata sugli errori di tool e modello.
   */
  public withRecovery(
    recovery: TypedRunnerRecoveryConfig<
      TAgent extends AgentBlueprint<any, any, any, infer TToolErrors, any> ? TToolErrors : Record<string, unknown>,
      TModel extends LanguageModelAdapter<infer TModelErrors> ? TModelErrors : unknown
    >
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld> {
    const orchestratorRecovery: OrchestratorRecoveryConfig = {
      onModelError: recovery.onModelError
        ? (error, context) =>
            (recovery.onModelError as (e: unknown, ctx: RecoveryContext) => Promise<RecoveryDecision> | RecoveryDecision)(
              error,
              context
            )
        : undefined,
      onToolError: async (toolId, error, context) => {
        const toolHandlers = recovery.onToolError as
          | Record<string, ((err: unknown, ctx: RecoveryContext) => Promise<RecoveryDecision> | RecoveryDecision) | undefined>
          | undefined;
        const handler = toolHandlers ? toolHandlers[toolId] : undefined;
        if (handler) {
          return await handler(error, context);
        }
        return { action: 'abort' };
      }
    };

    return new RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld>({
      ...this.state,
      options: {
        ...this.state.options,
        recovery: orchestratorRecovery
      }
    });
  }

  /**
   * Configura opzioni di esecuzione globali (budget, osservatori, maxMacroCycles, ecc.).
   */
  public withOptions(
    options: Partial<RunOptions<DataValue>>
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld> {
    return new RunnerBuilder<TEngine, TModel, TAgent, TOptions, TWorld, THasWorld>({
      ...this.state,
      options: { ...this.state.options, ...options }
    });
  }

  /**
   * Spawna l'istanza dell'agente nel runtime.
   * DISPONIBILE SOLO QUANDO Engine, Model, Agent e World sono tutti definiti nel tipo.
   */
  public spawn(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, AgentBlueprint<any, any, any, any, any>, any, any, true>
  ): AgentInstance<DataValue> {
    const implemented = this.state.agent!.bind(this.state.world);
    return implemented.spawn(this.state.engine!, this.state.model!);
  }

  /**
   * Spawna l'istanza dell'agente nel runtime ripartendo da uno stato pregresso fortemente tipizzato.
   * DISPONIBILE SOLO QUANDO Engine, Model, Agent e World sono tutti definiti nel tipo.
   */
  public spawnFromState(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, AgentBlueprint<any, any, any, any, any>, any, any, true>,
    state: TAgent extends AgentBlueprint<infer TTools, infer TStateSchema, any, any, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<any, any>
  ): AgentInstance<DataValue> {
    const implemented = this.state.agent!.bind(this.state.world);
    return implemented.spawnFromState(this.state.engine!, this.state.model!, state as any);
  }

  /**
   * Crea un EvaluationCollector tipizzato sull'agente associato a questo runner.
   */
  public createEvaluationCollector(): TAgent extends AgentBlueprint<infer TTools, infer TStateSchema, infer TTerminations, any, any>
    ? EvaluationCollector<TTools, TStateSchema, TTerminations>
    : EvaluationCollector {
    return new EvaluationCollector() as any;
  }

  /**
   * Esegue l'agente end-to-end.
   * DISPONIBILE SOLO QUANDO Engine, Model, Agent e World sono tutti definiti nel tipo.
   * Ritorna un esito tipizzato con unione discriminata ok: true | false.
   */
  public async run(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, AgentBlueprint<any, any, any, any, any>, any, any, true>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunnerResult<TAgent, TModel>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions,
      worldInstance: this.state.world,
      beforeToolUse: [
        ...(this.state.beforeToolUse ?? []),
        ...(runOptions?.beforeToolUse ?? [])
      ],
      afterToolUse: [
        ...(this.state.afterToolUse ?? []),
        ...(runOptions?.afterToolUse ?? [])
      ]
    };
    const implemented = this.state.agent!.bind(this.state.world);
    return (await implemented.run(
      this.state.engine!,
      this.state.model!,
      mergedOptions
    )) as unknown as InferAgentRunnerResult<TAgent, TModel>;
  }

  /**
   * Esegue l'agente a partire da uno stato pregresso fortemente tipizzato fino alla terminazione (halt).
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   */
  public async runFromState(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, AgentBlueprint<any, any, any, any, any>, any, any, true>,
    state: TAgent extends AgentBlueprint<infer TTools, infer TStateSchema, any, any, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<Record<string, never>, undefined>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunnerResult<TAgent, TModel>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions,
      worldInstance: this.state.world,
      beforeToolUse: [
        ...(this.state.beforeToolUse ?? []),
        ...(runOptions?.beforeToolUse ?? [])
      ],
      afterToolUse: [
        ...(this.state.afterToolUse ?? []),
        ...(runOptions?.afterToolUse ?? [])
      ]
    };
    const implemented = this.state.agent!.bind(this.state.world);
    return (await implemented.runFromState(
      this.state.engine!,
      this.state.model!,
      state as unknown as TypedAgentState<Record<string, never>, undefined>,
      mergedOptions
    )) as unknown as InferAgentRunnerResult<TAgent, TModel>;
  }
}

/**
 * Initializes a new type-safe `RunnerBuilder`.
 * By default, pre-configures a default `FrameworkEngine`, allowing you to directly chain `.withModel()` and `.withAgent()`.
 *
 * @example
 * ```typescript
 * import { createRunner } from '@formal-agent/core';
 *
 * const runner = createRunner()
 *   .withModel(myModelAdapter)
 *   .withAgent(myAgentDefinition, myAgentImplementation);
 *
 * const result = await runner.run({
 *   userContent: { kind: 'text', text: 'Analyze this input' },
 * });
 *
 * if (result.status === 'completed') {
 *   console.log('Result:', result.output);
 * }
 * ```
 *
 * @param options.defaultEngine If false, requires an explicit `.withEngine(engine)`.
 */
export function createRunner(options?: {
  defaultEngine?: true;
}): RunnerBuilder<FrameworkEngine, undefined, undefined, RunOptions<DataValue>>;
export function createRunner(options: {
  defaultEngine: false;
}): RunnerBuilder<undefined, undefined, undefined, RunOptions<DataValue>>;
export function createRunner(options?: {
  defaultEngine?: boolean;
}): RunnerBuilder<FrameworkEngine | undefined, undefined, undefined, RunOptions<DataValue>> {
  const useDefault = options?.defaultEngine !== false;
  return new RunnerBuilder({
    engine: useDefault ? new FrameworkEngine(createDefaultFrameworkConfig()) : undefined,
    options: {}
  });
}
