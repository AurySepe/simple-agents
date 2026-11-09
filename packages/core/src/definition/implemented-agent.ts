import { z } from 'zod';
import {
  AgentManifest,
  Concept,
  DataRecord,
  DataValue,
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
  ToolContract
} from './types.js';

export class ImplementedAgentImpl<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined,
  TTerminations extends Record<string, TerminationContractDef>
> implements ImplementedAgent<TTools, TStateSchema, TTerminations> {
  readonly manifest: AgentManifest<DataValue>;
  readonly world: WorldRegistry;

  constructor(
    readonly contract: AgentContract<TTools, TStateSchema, TTerminations>,
    readonly binding: AgentBinding<TTools, TStateSchema>
  ) {
    // 1. Validazione fail-fast dell'Identità ontologica (I)
    if (!contract.identity || contract.identity.trim().length === 0) {
      throw new Error("L'identità (identity) dell'agente è obbligatoria e non può essere vuota.");
    }

    // 2. Validazione fail-fast dei contratti di terminazione (A_term)
    const terminationEntries = Object.entries(contract.terminations);
    if (terminationEntries.length === 0) {
      throw new Error("L'agente deve definire almeno un contratto di terminazione in 'terminations'.");
    }

    // 3. Validazione fail-fast dell'implementazione di tutti i tool dichiarati
    for (const toolId of Object.keys(contract.tools)) {
      const executor = (binding.tools as Record<string, unknown>)[toolId];
      if (typeof executor !== 'function') {
        throw new Error(`Esecutore mancante o non valido per il tool dichiarato '${toolId}'.`);
      }
    }

    // 4. Validazione fail-fast dello stato iniziale rispetto a stateSchema
    let validatedInitialState: DataRecord = {};
    if (contract.stateSchema) {
      const rawInitialState = (binding as { initialState?: unknown }).initialState;
      if (rawInitialState === undefined || rawInitialState === null) {
        throw new Error(
          `È stato definito uno 'stateSchema' per l'agente '${contract.identity}', ma 'initialState' non è stato fornito nel binding.`
        );
      }
      const parsed = contract.stateSchema.safeParse(rawInitialState);
      if (!parsed.success) {
        throw new Error(
          `Lo stato iniziale fornito per l'agente '${contract.identity}' non rispetta 'stateSchema': ${parsed.error.message}`
        );
      }
      validatedInitialState = parsed.data as DataRecord;
    }

    // 5. Validazione fail-fast dei concetti di conoscenza (Ka0)
    if (contract.knowledge) {
      for (const [idx, item] of contract.knowledge.entries()) {
        if (!item || !item.name?.trim() || !item.descrizione?.trim() || !item.corpo?.trim()) {
          throw new Error(
            `Il concetto #${idx + 1} per l'agente '${contract.identity}' deve definire 'name', 'descrizione' e 'corpo' non vuoti.`
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
  }

  public spawn(
    engine: FrameworkEngine,
    model: LanguageModelAdapter
  ): AgentInstance<DataValue> {
    const boundRuntime = engine.bindWorld(this.world);
    return boundRuntime.spawnAgent(this.manifest, model);
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
}
