import { z } from 'zod';
import {
  AgentBinding,
  AgentContract,
  AgentDefinition,
  ImplementedAgent,
  TerminationContractDef,
  ToolContract,
  ValidateContractTerminations,
  ValidateContractTools
} from './types.js';
import { ImplementedAgentImpl } from './implemented-agent.js';
import { createAgentStateParser } from './state-parser.js';

/**
 * ============================================================================
 * FACTORY DICHIARATIVA DELL'AGENTE: defineAgent
 * ============================================================================
 * Definisce un contratto cognitivo di Livello 3 fortemente tipizzato a dipendenze zero.
 * Ritorna un AgentDefinition che espone il metodo .implement() per eseguire il binding esecutivo.
 *
 * @param contract La specifica dichiarativa (I, Ms0, Ta0 contracts, Ka0, A_term, Ds schema).
 * @returns AgentDefinition pronto per il binding con il Mondo.
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
    parseState(raw: unknown) {
      return parser(raw);
    },
    implement(
      binding: AgentBinding<TTools, TStateSchema>
    ): ImplementedAgent<TTools, TStateSchema, TTerminations> {
      return new ImplementedAgentImpl(contract, binding);
    }
  };
}

