import { z } from 'zod';
import {
  ActiveFSMState,
  AgentState,
  DataRecord,
  DiagnosticErrorPayload,
  ExitResult,
  Message,
  TerminationContract
} from '../types/index.js';
import {
  AgentContract,
  AgentDefinition,
  ImplementedAgent,
  TerminationContractDef,
  ToolContract,
  TypedAgentState
} from './types.js';
import { deriveFSMState, deriveTimeIndex } from './state-parser.js';

/**
 * ============================================================================
 * TIPI STRUTTURATI PER LA TRAIETTORIA COMPORTAMENTALE OFFLINE
 * ============================================================================
 */

/**
 * Singolo passo decisionale ricostruito dalla memoria episodica Ep.
 */
export interface TrajectoryStep<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> {
  step: number;
  macroCycle: number;
  tick: number;
  thought?: string;
  actions: Array<{
    id: string;
    name: (keyof TTools & string) | (keyof TTerminations & string);
    payload: unknown;
  }>;
  results: Array<{
    callId: string;
    status: 'success' | 'error';
    content: unknown;
  }>;
}

/**
 * Traiettoria comportamentale completa estratta da uno stato S,
 * fortemente tipizzata sulle definizioni di contratto dell'agente.
 */
export interface BehavioralTrajectory<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> {
  summary: {
    status: ActiveFSMState['phase'];
    isTerminated: boolean;
    exitContract?: keyof TTerminations & string;
    exitPayload?: TTerminations[keyof TTerminations]['schema'] extends z.ZodType
      ? z.infer<TTerminations[keyof TTerminations]['schema']>
      : unknown;
    totalSteps: number;
    totalToolCalls: number;
    repairCount: number;
    redundantCallsCount: number;
    macroCycles: number;
    ticks: number;
  };
  tools: {
    usageCounts: Partial<Record<keyof TTools & string, number>>;
    callSequence: Array<keyof TTools & string>;
  };
  state: {
    I: string;
    Ms: string;
    Ds: TStateSchema extends z.ZodType ? z.infer<TStateSchema> : DataRecord;
    Ta: Array<keyof TTools & string>;
    messagesCount: number;
  };
  steps: TrajectoryStep<TTools, TTerminations>[];
}

/**
 * ============================================================================
 * ESTRATTORE DI TRAIETTORIA COMPORTAMENTALE: extractBehavioralTrajectory
 * ============================================================================
 * Analizza uno Stato S già validato e tipizzato (TypedAgentState) e sintetizza una
 * rappresentazione strutturata e oggettiva del comportamento dell'agente
 * senza alcun giudizio o scoring imposto.
 *
 * NOTA ARCHITETTURALE: Questa funzione non accetta stringhe JSON grezze o tipi unknown.
 * Qualsiasi stato serializzato o esterno DEVE essere prima convalidato tramite
 * 'agent.parseState(rawState)' prima di essere fornito all'estrattore.
 *
 * @param target Il contratto, la definizione o l'istanza implementata dell'agente.
 * @param state Lo stato S già validato e fortemente tipizzato (TypedAgentState).
 * @returns La BehavioralTrajectory tipizzata conforme al contratto dell'agente.
 */
export function extractBehavioralTrajectory<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
>(
  target:
    | ImplementedAgent<TTools, TStateSchema, TTerminations>
    | AgentDefinition<TTools, TStateSchema, TTerminations>
    | AgentContract<TTools, TStateSchema, TTerminations>,
  state: TypedAgentState<TTools, TStateSchema>
): BehavioralTrajectory<TTools, TStateSchema, TTerminations> {
  const contract: AgentContract<TTools, TStateSchema, TTerminations> =
    'contract' in target ? target.contract : target;

  // 1. Costruzione dei contratti di terminazione per la derivazione deterministica FSM
  const terminationEntries = Object.entries(contract.terminations) as [
    string,
    TerminationContractDef
  ][];
  const terminations: TerminationContract[] = terminationEntries.map(
    ([id, termDef]) => ({
      id,
      description: termDef.description,
      schema: termDef.schema
    })
  );

  const rawAgentState: AgentState = {
    I: state.I,
    Ms: state.Ms,
    Ds: state.Ds as DataRecord,
    Ta: new Set(state.Ta),
    Ka: new Map(state.Ka.map((c) => [c.name, c])),
    Ep: state.Ep
  };

  const fsm = deriveFSMState(rawAgentState, terminations);
  const tau = deriveTimeIndex(state.Ep);

  // 3. Analisi della memoria episodica Ep e raggruppamento per passi decisionali
  const steps: TrajectoryStep<TTools, TTerminations>[] = [];
  const ep = state.Ep;

  let currentThought: string | undefined;
  let currentMacroCycle = 0;
  let currentTick = 0;

  const toolUsageCounts: Partial<Record<keyof TTools & string, number>> = {};
  const toolCallsSequence: Array<keyof TTools & string> = [];
  let redundantCallsCount = 0;
  let repairCount = 0;
  let totalToolCalls = 0;
  const seenCallSignatures = new Set<string>();

  for (let i = 0; i < ep.length; i++) {
    const msg = ep[i];
    if (msg.tau) {
      currentMacroCycle = msg.tau.c;
      currentTick = msg.tau.t;
    }

    if (msg.type === 'thought') {
      currentThought = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    } else if (msg.type === 'action') {
      // Raccoglie tutte le azioni contigue in questa stessa deliberazione
      const actions: Array<{
        id: string;
        name: (keyof TTools & string) | (keyof TTerminations & string);
        payload: unknown;
      }> = [];

      const callName = msg.content.name as (keyof TTools & string) | (keyof TTerminations & string);
      actions.push({
        id: msg.callId ?? `call_${i}`,
        name: callName,
        payload: msg.content.payload
      });

      // Se l'azione appartiene ai tool di mondo Ta, aggiorna le metriche dei tool
      if (callName in contract.tools) {
        const toolKey = callName as keyof TTools & string;
        totalToolCalls++;
        toolUsageCounts[toolKey] = (toolUsageCounts[toolKey] ?? 0) + 1;
        toolCallsSequence.push(toolKey);

        const signature = `${toolKey}:${JSON.stringify(msg.content.payload)}`;
        if (seenCallSignatures.has(signature)) {
          redundantCallsCount++;
        } else {
          seenCallSignatures.add(signature);
        }
      }

      while (i + 1 < ep.length && ep[i + 1].type === 'action') {
        i++;
        const nextAct = ep[i];
        if (nextAct.type === 'action') {
          const actName = nextAct.content.name as
            | (keyof TTools & string)
            | (keyof TTerminations & string);
          actions.push({
            id: nextAct.callId ?? `call_${i}`,
            name: actName,
            payload: nextAct.content.payload
          });

          if (actName in contract.tools) {
            const toolKey = actName as keyof TTools & string;
            totalToolCalls++;
            toolUsageCounts[toolKey] = (toolUsageCounts[toolKey] ?? 0) + 1;
            toolCallsSequence.push(toolKey);

            const signature = `${toolKey}:${JSON.stringify(nextAct.content.payload)}`;
            if (seenCallSignatures.has(signature)) {
              redundantCallsCount++;
            } else {
              seenCallSignatures.add(signature);
            }
          }
        }
      }

      // Raccoglie i risultati corrispondenti successivi
      const results: Array<{ callId: string; status: 'success' | 'error'; content: unknown }> = [];
      while (i + 1 < ep.length && ep[i + 1].type === 'result') {
        i++;
        const resMsg = ep[i];
        if (resMsg.type === 'result') {
          const content = resMsg.content as DiagnosticErrorPayload | undefined;
          const isErr =
            content &&
            typeof content === 'object' &&
            'status' in content &&
            content.status === 'error';

          if (isErr) {
            repairCount++;
          }

          results.push({
            callId: resMsg.callId ?? '',
            status: isErr ? 'error' : 'success',
            content: resMsg.content
          });
        }
      }

      steps.push({
        step: steps.length + 1,
        macroCycle: currentMacroCycle,
        tick: currentTick,
        thought: currentThought,
        actions,
        results
      });

      currentThought = undefined;
    }
  }

  // Se c'è un thought finale senza azioni (es. stallo deliberativo)
  if (currentThought !== undefined) {
    steps.push({
      step: steps.length + 1,
      macroCycle: currentMacroCycle,
      tick: currentTick,
      thought: currentThought,
      actions: [],
      results: []
    });
  }

  const isTerminated = fsm.phase === 'q_halt';
  const exitContract = isTerminated ? (fsm.exitResult.type as keyof TTerminations & string) : undefined;
  const exitPayload = isTerminated ? (fsm.exitResult.payload as any) : undefined;

  return {
    summary: {
      status: fsm.phase,
      isTerminated,
      exitContract,
      exitPayload,
      totalSteps: steps.length,
      totalToolCalls,
      repairCount,
      redundantCallsCount,
      macroCycles: tau.c,
      ticks: tau.t
    },
    tools: {
      usageCounts: toolUsageCounts,
      callSequence: toolCallsSequence
    },
    state: {
      I: state.I,
      Ms: state.Ms,
      Ds: state.Ds,
      Ta: state.Ta,
      messagesCount: state.Ep.length
    },
    steps
  };
}

