import {
  AgentInstance,
  FrameworkEngine,
  RunOptions,
  RunResult
} from '../engine/orchestrator.js';
import { DataValue, LanguageModelAdapter } from '../types/index.js';
import { createDefaultFrameworkConfig } from '../defaults/index.js';
import { AgentRunResult, ImplementedAgent, TypedAgentState } from './types.js';

type InferAgentRunResult<TAgent> = TAgent extends ImplementedAgent<any, any, infer TTerminations>
  ? AgentRunResult<TTerminations>
  : RunResult<DataValue>;

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
  TModel extends LanguageModelAdapter | undefined = undefined,
  TAgent extends ImplementedAgent<any, any, any> | undefined = undefined,
  TOptions extends RunOptions<DataValue> = RunOptions<DataValue>
> {
  constructor(
    private readonly state: {
      engine?: FrameworkEngine;
      model?: LanguageModelAdapter;
      agent?: ImplementedAgent<any, any, any>;
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
  public withModel(model: LanguageModelAdapter): RunnerBuilder<TEngine, LanguageModelAdapter, TAgent, TOptions> {
    return new RunnerBuilder<TEngine, LanguageModelAdapter, TAgent, TOptions>({
      ...this.state,
      model
    });
  }

  /**
   * Associa o sovrascrive l'agente implementato da eseguire.
   */
  public withAgent<A extends ImplementedAgent<any, any, any>>(
    agent: A
  ): RunnerBuilder<TEngine, TModel, A, TOptions> {
    return new RunnerBuilder<TEngine, TModel, A, TOptions>({
      ...this.state,
      agent
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
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter, ImplementedAgent<any, any, any>, any>
  ): AgentInstance<DataValue> {
    return this.state.agent!.spawn(this.state.engine!, this.state.model!);
  }

  /**
   * Spawna l'istanza dell'agente nel runtime ripartendo da uno stato pregresso fortemente tipizzato.
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   */
  public spawnFromState(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter, ImplementedAgent<any, any, any>, any>,
    state: TAgent extends ImplementedAgent<infer TTools, infer TStateSchema, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<any, any>
  ): AgentInstance<DataValue> {
    return this.state.agent!.spawnFromState(this.state.engine!, this.state.model!, state as any);
  }

  /**
   * Esegue l'agente end-to-end.
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   * Ritorna un esito tipizzato con unione discriminata sul tipo di terminazione e relativo payload.
   */
  public async run(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter, ImplementedAgent<any, any, any>, any>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunResult<TAgent>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions
    };
    return (await this.state.agent!.run(
      this.state.engine!,
      this.state.model!,
      mergedOptions
    )) as unknown as InferAgentRunResult<TAgent>;
  }

  /**
   * Esegue l'agente a partire da uno stato pregresso fortemente tipizzato fino alla terminazione (halt).
   * DISPONIBILE SOLO QUANDO Engine, Model e Agent sono tutti definiti nel tipo.
   */
  public async runFromState(
    this: RunnerBuilder<FrameworkEngine, LanguageModelAdapter, ImplementedAgent<any, any, any>, any>,
    state: TAgent extends ImplementedAgent<infer TTools, infer TStateSchema, any>
      ? TypedAgentState<TTools, TStateSchema>
      : TypedAgentState<any, any>,
    runOptions?: Partial<RunOptions<DataValue>>
  ): Promise<InferAgentRunResult<TAgent>> {
    const mergedOptions: RunOptions<DataValue> = {
      ...this.state.options,
      ...runOptions
    };
    return (await this.state.agent!.runFromState(
      this.state.engine!,
      this.state.model!,
      state as any,
      mergedOptions
    )) as unknown as InferAgentRunResult<TAgent>;
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
