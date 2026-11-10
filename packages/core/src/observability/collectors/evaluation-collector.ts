import { z } from 'zod';
import {
  AgentState,
  DataRecord,
  DataValue,
  FSMControlState,
  ModelUsageMetrics
} from '../../types/index.js';
import {
  AgentEvent,
  ExecutionErrorEvent,
  HaltEvent,
  ModelInferenceEvent,
  StallEvent,
  SuspendEvent,
  ToolErrorEvent,
  WorldActionEvent
} from '../events.js';
import { AgentObserver } from '../observer.js';
import type {
  AgentContract,
  AgentDefinition,
  ImplementedAgent,
  TerminationContractDef,
  ToolContract
} from '../../definition/types.js';

/**
 * ============================================================================
 * TIPI STRUTTURATI E PARAMETRICI SUL CONTRATTO DELL'AGENTE
 * ============================================================================
 */

/**
 * Record di audit dettagliato per un singolo passo decisionale, fortemente tipizzato
 * sullo schema di stato (Ds), sui tool (Ta) e sulle terminazioni.
 */
export interface StepEvaluationRecord<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> {
  step: number;
  macroCycle: number;
  tick: number;
  phase: FSMControlState;
  thought?: string;
  actions: Array<{
    id: string;
    name: (keyof TTools & string) | (keyof TTerminations & string);
    payload: DataRecord;
  }>;
  worldResults: Array<{
    toolId: keyof TTools & string;
    durationMs: number;
    status: 'success' | 'failure';
    result?: unknown;
    error?: unknown;
  }>;
  state: {
    Ms: string;
    Ds: TStateSchema extends z.ZodType ? z.infer<TStateSchema> : DataRecord;
    Ta: Array<keyof TTools & string>;
    messagesCount: number;
  };
  durationMs: number;
  usage?: ModelUsageMetrics;
}

/**
 * Unione discriminata sui possibili esiti di uscita da A_term per l'esito 'halt'.
 */
export type EvaluationHaltSummary<
  TTerminations extends Record<string, TerminationContractDef>
> = {
  [K in keyof TTerminations & string]: {
    status: 'halt';
    exitContract: K;
    exitPayload: TTerminations[K]['schema'] extends z.ZodType
      ? z.infer<TTerminations[K]['schema']>
      : unknown;
    suspensionReason?: never;
  };
}[keyof TTerminations & string];

export type EvaluationNonHaltSummary =
  | {
      status: 'stall';
      exitContract?: never;
      exitPayload?: never;
      suspensionReason?: never;
      error?: never;
    }
  | {
      status: 'suspended';
      exitContract?: never;
      exitPayload?: never;
      suspensionReason: 'aborted' | 'cycle_limit' | 'tick_limit';
      error?: never;
    }
  | {
      status: 'error';
      exitContract?: never;
      exitPayload?: never;
      suspensionReason?: never;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    }
  | {
      status: 'running';
      exitContract?: never;
      exitPayload?: never;
      suspensionReason?: never;
      error?: never;
    };

/**
 * Sintesi complessiva e aggregata della sessione dell'agente.
 * Se lo status è 'halt', exitContract e exitPayload sono fortemente tipizzati
 * sulle terminazioni A_term dichiarate nel contratto dell'agente.
 */
export type EvaluationSummary<
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> = ([keyof TTerminations] extends [never]
  ? {
      status: 'halt';
      exitContract?: string;
      exitPayload?: unknown;
      suspensionReason?: never;
    } | EvaluationNonHaltSummary
  : EvaluationHaltSummary<TTerminations> | EvaluationNonHaltSummary) & {
  totalMacroCycles: number;
  totalTicks: number;
  totalInferences: number;
  totalWorldActions: number;
  repairCount: number;
  selfRepairedSuccessfully: boolean;
};

/**
 * Metriche prestazionali e consumi fisici dell'esecuzione.
 */
export interface PerformanceMetrics {
  wallClockDurationMs: number;
  totalInferenceDurationMs: number;
  totalWorldDurationMs: number;
  avgInferenceDurationMs: number;
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgTokensPerSecond?: number;
  };
}

/**
 * Metriche di qualità comportamentale e traiettoria operativa.
 * I nomi dei tool e le sequenze sono vincolati al toolbelt del contratto.
 */
export interface BehavioralMetrics<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>
> {
  toolUsageCounts: Partial<Record<keyof TTools & string, number>>;
  toolCallsSequence: Array<keyof TTools & string>;
  redundantCallsCount: number;
  hadRepairOccurrences: boolean;
}

/**
 * Report di valutazione completo e strutturato che incrocia stato e performance,
 * parametrizzato sui contratti e sugli schemi Zod dell'agente.
 */
export interface EvaluationReport<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> {
  summary: EvaluationSummary<TTerminations>;
  performance: PerformanceMetrics;
  behavior: BehavioralMetrics<TTools>;
  timeline: StepEvaluationRecord<TTools, TStateSchema, TTerminations>[];
}

/**
 * ============================================================================
 * COLLECTOR DI VALUTAZIONE E AUDIT (EvaluationCollector)
 * ============================================================================
 * Cattura in tempo reale tutti gli eventi dell'orchestratore e sintetizza
 * un EvaluationReport completo incrociando lo stato cognitivo dell'agente
 * con le metriche di performance e di consumo token.
 */
export class EvaluationCollector<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
> implements AgentObserver {
  private events: AgentEvent[] = [];
  private startTime: number = Date.now();
  private endTime?: number;

  public onEvent(event: AgentEvent): void {
    if (this.events.length === 0) {
      this.startTime = event.timestamp.getTime();
    }
    this.events.push(event);

    if (
      event.type === 'halt' ||
      event.type === 'stall' ||
      event.type === 'suspend' ||
      event.type === 'execution_error'
    ) {
      this.endTime = event.timestamp.getTime();
    }
  }

  public getRawEvents(): readonly AgentEvent[] {
    return this.events;
  }

  public clear(): void {
    this.events = [];
    this.startTime = Date.now();
    this.endTime = undefined;
  }

  /**
   * Genera il report di valutazione incrociando lo stato cognitivo con le performance.
   */
  public generateReport(): EvaluationReport<TTools, TStateSchema, TTerminations> {
    const inferences = this.events.filter((e): e is ModelInferenceEvent => e.type === 'model_inference');
    const worldActions = this.events.filter((e): e is WorldActionEvent => e.type === 'world_action');
    const toolErrors = this.events.filter((e): e is ToolErrorEvent => e.type === 'tool_error');
    const haltEvent = this.events.find((e): e is HaltEvent => e.type === 'halt');
    const stallEvent = this.events.find((e): e is StallEvent => e.type === 'stall');
    const suspendEvent = this.events.find((e): e is SuspendEvent => e.type === 'suspend');
    const executionErrorEvent = this.events.find((e): e is ExecutionErrorEvent => e.type === 'execution_error');

    // 1. Calcolo metriche di performance & token
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const tpsList: number[] = [];

    let totalInferenceDurationMs = 0;
    for (const inf of inferences) {
      totalInferenceDurationMs += inf.durationMs;
      if (inf.output.usage) {
        if (inf.output.usage.promptTokens !== undefined) {
          promptTokens += inf.output.usage.promptTokens;
        }
        if (inf.output.usage.completionTokens !== undefined) {
          completionTokens += inf.output.usage.completionTokens;
        }
        if (inf.output.usage.totalTokens !== undefined) {
          totalTokens += inf.output.usage.totalTokens;
        }
        if (inf.output.usage.tokensPerSecond !== undefined) {
          tpsList.push(inf.output.usage.tokensPerSecond);
        }
      }
    }

    let totalWorldDurationMs = 0;
    for (const w of worldActions) {
      totalWorldDurationMs += w.durationMs;
    }

    const wallClockEnd = this.endTime ?? Date.now();
    const wallClockDurationMs = Math.max(0, wallClockEnd - this.startTime);

    // 2. Calcolo metriche comportamentali
    const toolUsageCounts: Partial<Record<keyof TTools & string, number>> = {};
    const toolCallsSequence: Array<keyof TTools & string> = [];
    let redundantCallsCount = 0;
    const seenCallSignatures = new Set<string>();

    for (const w of worldActions) {
      const toolId = w.toolId as keyof TTools & string;
      toolUsageCounts[toolId] = ((toolUsageCounts[toolId] ?? 0) + 1);
      toolCallsSequence.push(toolId);

      const signature = `${w.toolId}:${JSON.stringify(w.args)}`;
      if (seenCallSignatures.has(signature)) {
        redundantCallsCount++;
      } else {
        seenCallSignatures.add(signature);
      }
    }

    const avgInferenceDurationMs = inferences.length > 0
      ? Math.round(totalInferenceDurationMs / inferences.length)
      : 0;

    const avgTokensPerSecond = tpsList.length > 0
      ? Number((tpsList.reduce((a, b) => a + b, 0) / tpsList.length).toFixed(1))
      : undefined;

    // 3. Calcolo timeline passo-passo
    const timeline: StepEvaluationRecord<TTools, TStateSchema, TTerminations>[] = inferences.map((inf, idx) => {
      const stepActions = inf.output.status === 'stall'
        ? []
        : inf.output.calls.map((c) => ({
            id: c.id,
            name: c.name as (keyof TTools & string) | (keyof TTerminations & string),
            payload: c.payload
          }));

      // Associa i risultati fisici delle azioni del mondo avvenute tra questa deliberazione e la successiva
      const infEventIndex = this.events.indexOf(inf);
      const nextInf = inferences[idx + 1];
      const nextInfEventIndex = nextInf ? this.events.indexOf(nextInf) : this.events.length;

      const stepWorldResults = this.events
        .slice(infEventIndex + 1, nextInfEventIndex)
        .filter((e): e is WorldActionEvent => e.type === 'world_action')
        .map((w) => ({
          toolId: w.toolId as keyof TTools & string,
          durationMs: w.durationMs,
          status: w.status,
          result: w.result,
          error: w.error
        }));

      return {
        step: idx + 1,
        macroCycle: inf.macroCycle,
        tick: inf.tick,
        phase: inf.controlState,
        thought: inf.output.status === 'stall' ? inf.output.stall.partialThought : inf.output.thought,
        actions: stepActions,
        worldResults: stepWorldResults,
        state: {
          Ms: inf.stateSnapshot.Ms,
          Ds: { ...inf.stateSnapshot.Ds } as any,
          Ta: Array.from(inf.stateSnapshot.Ta) as Array<keyof TTools & string>,
          messagesCount: inf.stateSnapshot.Ep.length
        },
        durationMs: inf.durationMs,
        usage: inf.output.usage
      };
    });

    const repairCount = toolErrors.length;
    const lastEvent = this.events[this.events.length - 1];
    const totalMacroCycles = lastEvent ? lastEvent.macroCycle + 1 : 0;
    const totalTicks = lastEvent ? lastEvent.tick + 1 : 0;

    let baseSummary: any;
    if (haltEvent) {
      baseSummary = {
        status: 'halt',
        exitContract: haltEvent.result.type,
        exitPayload: haltEvent.result.payload
      };
    } else if (stallEvent) {
      baseSummary = {
        status: 'stall'
      };
    } else if (suspendEvent) {
      baseSummary = {
        status: 'suspended',
        suspensionReason: suspendEvent.reason
      };
    } else if (executionErrorEvent) {
      baseSummary = {
        status: 'error',
        error: executionErrorEvent.error
      };
    } else {
      baseSummary = {
        status: 'running'
      };
    }

    const summary: EvaluationSummary<TTerminations> = {
      ...baseSummary,
      totalMacroCycles,
      totalTicks,
      totalInferences: inferences.length,
      totalWorldActions: worldActions.length,
      repairCount,
      selfRepairedSuccessfully: repairCount > 0 && baseSummary.status === 'halt'
    };

    return {
      summary,
      performance: {
        wallClockDurationMs,
        totalInferenceDurationMs,
        totalWorldDurationMs,
        avgInferenceDurationMs,
        tokens: {
          promptTokens,
          completionTokens,
          totalTokens,
          avgTokensPerSecond
        }
      },
      behavior: {
        toolUsageCounts,
        toolCallsSequence,
        redundantCallsCount,
        hadRepairOccurrences: repairCount > 0
      },
      timeline
    };
  }
}

/**
 * Factory helper per istanziare un EvaluationCollector.
 * Quando viene passato un agente implementato o la sua definizione,
 * i generics sono inferiti automaticamente e il report risulta tipizzato al 100%.
 */
export function createEvaluationCollector(): EvaluationCollector;
export function createEvaluationCollector<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
>(
  target:
    | ImplementedAgent<TTools, TStateSchema, TTerminations>
    | AgentDefinition<TTools, TStateSchema, TTerminations>
    | AgentContract<TTools, TStateSchema, TTerminations>
): EvaluationCollector<TTools, TStateSchema, TTerminations>;
export function createEvaluationCollector<
  TTools extends Record<string, ToolContract> = Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, TerminationContractDef> = Record<string, TerminationContractDef>
>(
  _target?:
    | ImplementedAgent<TTools, TStateSchema, TTerminations>
    | AgentDefinition<TTools, TStateSchema, TTerminations>
    | AgentContract<TTools, TStateSchema, TTerminations>
): EvaluationCollector<TTools, TStateSchema, TTerminations> {
  return new EvaluationCollector<TTools, TStateSchema, TTerminations>();
}
