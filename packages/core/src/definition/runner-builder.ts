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
import { AgentRunnerResult, ImplementedAgent, TypedAgentState, WorldExecutionError, ModelExecutionError } from './types.js';
import { EvaluationCollector } from '../observability/collectors/evaluation-collector.js';
import { UnexpectedToolError } from '../world/index.js';

type InferAgentRunnerResult<TAgent, TModel> = TAgent extends ImplementedAgent<
  any,
  any,
  infer TTerminations,
  infer TToolErrorsMap
>
  ? TModel extends LanguageModelAdapter<infer TModelErrors>
    ? AgentRunnerResult<TTerminations, TToolErrorsMap, TModelErrors>
    : AgentRunnerResult<TTerminations, TToolErrorsMap, any>
  : AgentRunnerResult<any, any, any>;

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
  TAgent extends ImplementedAgent<any, any, any, any> | undefined = undefined,
  TOptions extends RunOptions<DataValue> = RunOptions<DataValue>
> {
  constructor(
    private readonly state: {
      engine?: FrameworkEngine;
      model?: LanguageModelAdapter<any>;
      agent?: ImplementedAgent<any, any, any, any>;
      options?: RunOptions<DataValue>;
    }
  ) {}

  /**
   * Associa o sovrascrive il FrameworkEngine di Livello 1.
   */
  public withEngine(engine: FrameworkEngine): RunnerBuilder<FrameworkEngine, TModel, TAgent, TOptions> {
    return new RunnerBuilder<FrameworkEngine, TModel, TAgent, TOptions>({
      ...this.state,
      engine
    });
  }

  /**
   * Associa o sovrascrive l'adapter del modello linguistico (LLM).
   */
  public withModel<M extends LanguageModelAdapter<any>>(model: M): RunnerBuilder<TEngine, M, TAgent, TOptions> {
    return new RunnerBuilder<TEngine, M, TAgent, TOptions>({
      ...this.state,
      model
    });
  }

  /**
   * Associa o sovrascrive l'agente implementato da eseguire.
   */
  public withAgent<A extends ImplementedAgent<any, any, any, any>>(
    agent: A
  ): RunnerBuilder<TEngine, TModel, A, TOptions> {
    return new RunnerBuilder<TEngine, TModel, A, TOptions>({
      ...this.state,
      agent
    });
  }

  /**
   * Configura una recovery policy dichiarativa fortemente tipizzata sugli errori di tool e modello.
   */
  public withRecovery(
    recovery: TypedRunnerRecoveryConfig<
      TAgent extends ImplementedAgent<any, any, any, infer TToolErrors> ? TToolErrors : Record<string, unknown>,
      TModel extends LanguageModelAdapter<infer TModelErrors> ? TModelErrors : unknown
    >
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions> {
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

    return new RunnerBuilder<TEngine, TModel, TAgent, TOptions>({
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
  ): RunnerBuilder<TEngine, TModel, TAgent, TOptions> {
    return new RunnerBuilder<TEngine, TModel, TAgent, TOptions>({
      ...this.state,
      options: { ...this.state.options, ...options }
    });
  }

  /**
   * Spawna l'istanza dell'agente nel runtime.
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   */
  public spawn(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, ImplementedAgent<any, any, any, any>, any>
  ): AgentInstance<DataValue> {
    return this.state.agent!.spawn(this.state.engine!, this.state.model!);
  }

  /**
   * Spawna l'istanza dell'agente nel runtime ripartendo da uno stato pregresso fortemente tipizzato.
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   */
  public spawnFromState(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, ImplementedAgent<any, any, any, any>, any>,
    state: TAgent extends ImplementedAgent<infer TTools, infer TStateSchema, any, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<any, any>
  ): AgentInstance<DataValue> {
    return this.state.agent!.spawnFromState(this.state.engine!, this.state.model!, state as any);
  }

  /**
   * Crea un EvaluationCollector tipizzato sull'agente associato a questo runner.
   */
  public createEvaluationCollector(): TAgent extends ImplementedAgent<infer TTools, infer TStateSchema, infer TTerminations, any>
    ? EvaluationCollector<TTools, TStateSchema, TTerminations>
    : EvaluationCollector {
    return new EvaluationCollector() as any;
  }

  /**
   * Esegue l'agente end-to-end.
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   * Ritorna un esito tipizzato con unione discriminata ok: true | false.
   */
  public async run(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, ImplementedAgent<any, any, any, any>, any>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunnerResult<TAgent, TModel>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions
    };
    return (await this.state.agent!.run(
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
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter<any>, ImplementedAgent<any, any, any, any>, any>,
    state: TAgent extends ImplementedAgent<infer TTools, infer TStateSchema, any, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<Record<string, never>, undefined>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunnerResult<TAgent, TModel>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions
    };
    return (await this.state.agent!.runFromState(
      this.state.engine!,
      this.state.model!,
      state as unknown as TypedAgentState<Record<string, never>, undefined>,
      mergedOptions
    )) as unknown as InferAgentRunnerResult<TAgent, TModel>;
  }
}

/**
 * Inizializza un nuovo RunnerBuilder.
 * Di default pre-configura il FrameworkEngine con createDefaultFrameworkConfig()
 * consentendo di passare direttamente al modello e all'agente.
 *
 * @param options.defaultEngine Se false, richiede l'esplicito .withEngine(engine).
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
