import { z } from 'zod';
import {
  AgentBinding,
  AgentContract,
  AgentDefinition,
  ImplementedAgent,
  TerminationContractDef,
  ToolContract,
  TypedAgentState,
  ValidateContractTerminations,
  ValidateContractTools
} from './types.js';
import { ImplementedAgentImpl } from './implemented-agent.js';
import { createAgentStateParser } from './state-parser.js';
import { EvaluationCollector } from '../observability/collectors/evaluation-collector.js';
import { extractBehavioralTrajectory } from './trajectory-extractor.js';

/**
 * ============================================================================
 * FACTORY DICHIARATIVA DELL'AGENTE: defineAgent
 * ============================================================================
 * Declares a strictly-typed, contract-first agent definition with zero runtime dependencies.
 * Returns an `AgentDefinition` providing `.implement()` for world binding, `.parseState()` for offline validation,
 * and `.extractTrajectory()` for behavioral audits.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { defineAgent } from '@formal-agent/core';
 *
 * export const myAgent = defineAgent({
 *   identity: 'SupportAgent',
 *   mission: 'Assist users with order lookups.',
 *   tools: {
 *     lookupOrder: {
 *       description: 'Fetch order details by order ID.',
 *       parameters: z.object({ orderId: z.string() }),
 *       result: z.object({ status: z.string(), items: z.array(z.string()) }),
 *     },
 *   },
 *   terminations: {
 *     completed: z.object({ message: z.string() }),
 *   },
 * });
 * ```
 *
 * @param contract The declarative contract specifying tools, terminations, identity, mission, and optional custom state schema.
 * @returns AgentDefinition ready for implementation binding.
 */
export function defineAgent<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
>(
  contract: AgentContract<TTools, TStateSchema, TTerminations> & {
    tools: ValidateContractTools<TTools>;
    terminations: ValidateContractTerminations<TTerminations>;
  } & ([keyof TTerminations] extends [never]
    ? { terminations: 'ERRORE_COMPILE_TIME: terminations non può essere vuoto. Devi dichiarare almeno una terminazione.' }
    : unknown)
): AgentDefinition<TTools, TStateSchema, TTerminations> {
  const parser = createAgentStateParser(contract as AgentContract<TTools, TStateSchema, TTerminations>);

  return {
    contract,
    createEvaluationCollector() {
      return new EvaluationCollector<TTools, TStateSchema, TTerminations>();
    },
    parseState(raw: unknown) {
      return parser(raw);
    },
    extractTrajectory(state: TypedAgentState<TTools, TStateSchema>) {
      return extractBehavioralTrajectory(this, state);
    },
    implement<TToolErrorsMap extends Record<keyof TTools, any> = Record<keyof TTools, any>>(
      binding: AgentBinding<TTools, TStateSchema, TToolErrorsMap>
    ): ImplementedAgent<TTools, TStateSchema, TTerminations, TToolErrorsMap> {
      return new ImplementedAgentImpl(contract, binding);
    }
  };
}

