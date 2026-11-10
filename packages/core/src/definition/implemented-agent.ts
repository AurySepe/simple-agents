import { z } from 'zod';
import {
  AgentManifest,
  Concept,
  DataRecord,
  DataValue,
  deserializeAgentState,
  TerminationContract,
  ToolResult,
  WorldTool,
  LanguageModelAdapter
} from '../types/index.js';
import { FrameworkEngine, AgentInstance, RunOptions, RunResult } from '../engine/orchestrator.js';
import { createWorldRegistry, WorldRegistry } from '../world/index.js';
import {
  AgentBinding,
  AgentContract,
  AgentRunResult,
  ImplementedAgent,
  TerminationContractDef,
  ToolContract,
  TypedAgentState
} from './types.js';
import { createAgentStateParser } from './state-parser.js';
import { EvaluationCollector } from '../observability/collectors/evaluation-collector.js';
import { BehavioralTrajectory, extractBehavioralTrajectory } from './trajectory-extractor.js';

export class ImplementedAgentImpl<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef>
> implements ImplementedAgent<TTools, TStateSchema, TTerminations> {
  readonly manifest: AgentManifest<DataValue>;
  readonly world: WorldRegistry;
  private readonly parser: (raw: unknown) => TypedAgentState<TTools, TStateSchema>;

  constructor(
    readonly contract: AgentContract<TTools, TStateSchema, TTerminations>,
    readonly binding: AgentBinding<TTools, TStateSchema>
  ) {
    // 1. Fail-fast validation of ontological Identity (I)
    if (!contract.identity || contract.identity.trim().length === 0) {
      throw new Error("Agent identity is required and cannot be empty.");
    }

    // 2. Fail-fast validation of termination contracts (A_term)
    const terminationEntries = Object.entries(contract.terminations);
    if (terminationEntries.length === 0) {
      throw new Error("Agent must define at least one termination contract in 'terminations'.");
    }

    // 3. Fail-fast validation of implementations for all declared tools
    for (const toolId of Object.keys(contract.tools)) {
      const executor = (binding.tools as Record<string, unknown>)[toolId];
      if (typeof executor !== 'function') {
        throw new Error(`Missing or invalid executor for declared tool '${toolId}'.`);
      }
    }

    // 4. Fail-fast validation of initial state against stateSchema
    let validatedInitialState: DataRecord = {};
    if (contract.stateSchema) {
      const rawInitialState = (binding as { initialState?: unknown }).initialState;
      if (rawInitialState === undefined || rawInitialState === null) {
        throw new Error(
          `'stateSchema' was defined for agent '${contract.identity}', but 'initialState' was not provided in binding.`
        );
      }
      const parsed = contract.stateSchema.safeParse(rawInitialState);
      if (!parsed.success) {
        throw new Error(
          `Initial state provided for agent '${contract.identity}' does not satisfy 'stateSchema': ${parsed.error.message}`
        );
      }
      validatedInitialState = parsed.data as DataRecord;
    }

    // 5. Fail-fast validation of knowledge concepts (Ka0)
    if (contract.knowledge) {
      for (const [idx, item] of contract.knowledge.entries()) {
        if (!item || !item.name?.trim() || !item.descrizione?.trim() || !item.corpo?.trim()) {
          throw new Error(
            `Knowledge concept #${idx + 1} for agent '${contract.identity}' must define non-empty 'name', 'descrizione' and 'corpo'.`
          );
        }
      }
    }

    // 6. Costruzione del catalogo fisico dei tool del Mondo W
    const worldTools: WorldTool[] = Object.entries(contract.tools).map(([toolId, toolDef]) => {
      return {
        id: toolId,
        description: toolDef.description,
        parameters: toolDef.parameters,
        returns: toolDef.returns,
        execute: async (args: DataRecord): Promise<ToolResult> => {
          const executor = (binding.tools as Record<string, (input: unknown) => Promise<ToolResult> | ToolResult>)[toolId];
          return await executor(args);
        }
      };
    });

    this.world = createWorldRegistry(worldTools);

    // 7. Costruzione dei contratti di terminazione tipizzati A_term
    const terminations: TerminationContract[] = terminationEntries.map(
      ([id, termDef]) => ({
        id,
        description: termDef.description,
        schema: termDef.schema
      })
    );

    // 8. Creazione del Manifesto formale di Livello 3 (AgentManifest)
    this.manifest = {
      I: contract.identity,
      Ms0: contract.mission,
      Ka0: contract.knowledge,
      Ta0: Object.keys(contract.tools),
      Ds0: validatedInitialState,
      A_term: terminations
    };

    // 9. Sintesi automatica del parser di stato type-safe conforme al contratto
    this.parser = createAgentStateParser(contract);
  }

  public createEvaluationCollector(): EvaluationCollector<TTools, TStateSchema, TTerminations> {
    return new EvaluationCollector<TTools, TStateSchema, TTerminations>();
  }

  public parseState(raw: unknown): TypedAgentState<TTools, TStateSchema> {
    return this.parser(raw);
  }

  public extractTrajectory(state: TypedAgentState<TTools, TStateSchema>): BehavioralTrajectory<TTools, TStateSchema, TTerminations> {
    return extractBehavioralTrajectory(this, state);
  }

  public spawn(
    engine: FrameworkEngine,
    model: LanguageModelAdapter
  ): AgentInstance<DataValue> {
    const boundRuntime = engine.bindWorld(this.world);
    return boundRuntime.spawnAgent(this.manifest, model);
  }

  public spawnFromState(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    state: TypedAgentState<TTools, TStateSchema>
  ): AgentInstance<DataValue> {
    const rawState = deserializeAgentState(state as any);
    const boundRuntime = engine.bindWorld(this.world);
    return boundRuntime.spawnAgent(this.manifest, model, rawState);
  }

  public async run(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunResult<TTerminations>> {
    const boundRuntime = engine.bindWorld(this.world);
    return (await boundRuntime.runAgent(
      this.manifest,
      model,
      options
    )) as unknown as AgentRunResult<TTerminations>;
  }

  public async runFromState(
    engine: FrameworkEngine,
    model: LanguageModelAdapter,
    state: TypedAgentState<TTools, TStateSchema>,
    options?: RunOptions<DataValue>
  ): Promise<AgentRunResult<TTerminations>> {
    const rawState = deserializeAgentState(state as any);
    const boundRuntime = engine.bindWorld(this.world);
    return (await boundRuntime.runAgent(
      this.manifest,
      model,
      { ...options, initialState: rawState }
    )) as unknown as AgentRunResult<TTerminations>;
  }
}
