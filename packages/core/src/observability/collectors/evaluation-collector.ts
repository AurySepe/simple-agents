import {
  AgentState,
  DataRecord,
  DataValue,
  FSMControlState,
  ModelUsageMetrics
} from '../../types/index.js';
import {
  AgentEvent,
  HaltEvent,
  ModelInferenceEvent,
  StallEvent,
  SuspendEvent,
  ToolErrorEvent,
  WorldActionEvent
} from '../events.js';
import { AgentObserver } from '../observer.js';

/**
 * Profilo di audit dettagliato per un singolo passo decisionale.
 */
export interface StepEvaluationRecord {
  step: number;
  macroCycle: number;
  tick: number;
  phase: FSMControlState;
  thought?: string;
  actions: Array<{ id: string; name: string; payload: DataRecord }>;
  worldResults: Array<{
    toolId: string;
    durationMs: number;
    status: 'success' | 'failure';
    result?: unknown;
    error?: unknown;
  }>;
  state: {
    Ms: string;
    Ds: DataRecord;
    Ta: string[];
    messagesCount: number;
  };
  durationMs: number;
  usage?: ModelUsageMetrics;
}

/**
 * Sintesi complessiva e aggregata della sessione dell'agente.
 */
export interface EvaluationSummary {
  status: 'halt' | 'stall' | 'suspended' | 'running';
  exitContract?: string;
  exitPayload?: unknown;
  suspensionReason?: 'aborted' | 'cycle_limit' | 'tick_limit';
  totalMacroCycles: number;
  totalTicks: number;
  totalInferences: number;
  totalWorldActions: number;
  repairCount: number;
  selfRepairedSuccessfully: boolean;
}

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
 */
export interface BehavioralMetrics {
  toolUsageCounts: Record<string, number>;
  toolCallsSequence: string[];
  redundantCallsCount: number;
  hadRepairOccurrences: boolean;
}

/**
 * Report di valutazione completo e strutturato che incrocia stato e performance.
 */
export interface EvaluationReport {
  summary: EvaluationSummary;
  performance: PerformanceMetrics;
  behavior: BehavioralMetrics;
  timeline: StepEvaluationRecord[];
}

/**
 * ============================================================================
 * COLLECTOR DI VALUTAZIONE E AUDIT (EvaluationCollector)
 * ============================================================================
 * Cattura in tempo reale tutti gli eventi dell'orchestratore e sintetizza
 * un EvaluationReport completo incrociando lo stato cognitivo dell'agente
 * con le metriche di performance e di consumo token.
 */
export class EvaluationCollector implements AgentObserver {
  private events: AgentEvent[] = [];
  private startTime: number = Date.now();
  private endTime?: number;

  public onEvent(event: AgentEvent): void {
    if (this.events.length === 0) {
      this.startTime = event.timestamp.getTime();
    }
    this.events.push(event);

    if (event.type === 'halt' || event.type === 'stall' || event.type === 'suspend') {
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
  public generateReport(): EvaluationReport {
    const inferences = this.events.filter((e): e is ModelInferenceEvent => e.type === 'model_inference');
    const worldActions = this.events.filter((e): e is WorldActionEvent => e.type === 'world_action');
    const toolErrors = this.events.filter((e): e is ToolErrorEvent => e.type === 'tool_error');
    const haltEvent = this.events.find((e): e is HaltEvent => e.type === 'halt');
    const stallEvent = this.events.find((e): e is StallEvent => e.type === 'stall');
    const suspendEvent = this.events.find((e): e is SuspendEvent => e.type === 'suspend');

    // 1. Determinazione dello status
    let status: EvaluationSummary['status'] = 'running';
    let exitContract: string | undefined;
    let exitPayload: unknown | undefined;
    let suspensionReason: EvaluationSummary['suspensionReason'];

    if (haltEvent) {
      status = 'halt';
      exitContract = haltEvent.result.type;
      exitPayload = haltEvent.result.payload;
    } else if (stallEvent) {
      status = 'stall';
    } else if (suspendEvent) {
      status = 'suspended';
      suspensionReason = suspendEvent.reason;
    }

    // 2. Calcolo metriche temporali
    const end = this.endTime ?? Date.now();
    const wallClockDurationMs = Math.max(0, end - this.startTime);

    let totalInferenceDurationMs = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    const tpsList: number[] = [];

    for (const inf of inferences) {
      totalInferenceDurationMs += inf.durationMs;
      if (inf.output.usage) {
        promptTokens += inf.output.usage.promptTokens ?? 0;
        completionTokens += inf.output.usage.completionTokens ?? 0;
        totalTokens += inf.output.usage.totalTokens ?? (promptTokens + completionTokens);
        if (inf.output.usage.tokensPerSecond) {
          tpsList.push(inf.output.usage.tokensPerSecond);
        }
      }
    }

    let totalWorldDurationMs = 0;
    const toolUsageCounts: Record<string, number> = {};
    const toolCallsSequence: string[] = [];
    const seenCallSignatures = new Set<string>();
    let redundantCallsCount = 0;

    for (const w of worldActions) {
      totalWorldDurationMs += w.durationMs;
      toolUsageCounts[w.toolId] = (toolUsageCounts[w.toolId] ?? 0) + 1;
      toolCallsSequence.push(w.toolId);

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
    const timeline: StepEvaluationRecord[] = inferences.map((inf, idx) => {
      const stepActions = inf.output.status === 'stall'
        ? []
        : inf.output.calls.map((c) => ({
            id: c.id,
            name: c.name,
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
          toolId: w.toolId,
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
          Ds: { ...inf.stateSnapshot.Ds },
          Ta: Array.from(inf.stateSnapshot.Ta),
          messagesCount: inf.stateSnapshot.Ep.length
        },
        durationMs: inf.durationMs,
        usage: inf.output.usage
      };
    });

    const repairCount = toolErrors.length;
    const selfRepairedSuccessfully = repairCount > 0 && status === 'halt';

    return {
      summary: {
        status,
        exitContract,
        exitPayload,
        suspensionReason,
        totalMacroCycles: this.events.length > 0 ? this.events[this.events.length - 1].macroCycle : 0,
        totalTicks: this.events.length > 0 ? this.events[this.events.length - 1].tick : 0,
        totalInferences: inferences.length,
        totalWorldActions: worldActions.length,
        repairCount,
        selfRepairedSuccessfully
      },
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
 */
export function createEvaluationCollector(): EvaluationCollector {
  return new EvaluationCollector();
}
