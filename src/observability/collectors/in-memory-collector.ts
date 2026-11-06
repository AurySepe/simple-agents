import { z } from 'zod';
import {
  AgentEvent,
  AgentEventType,
  CognitiveActionEvent,
  ModelInferenceEvent,
  WorldActionEvent
} from '../events.js';
import { AgentObserver } from '../observer.js';
import { DataRecord } from '../../types/index.js';

/**
 * ============================================================================
 * RACCOLTA TELEMETRIA IN MEMORIA (InMemoryTelemetryCollector)
 * ============================================================================
 * Memorizza tutti gli eventi emessi durante l'esecuzione per successiva
 * ispezione, test di regressione, esportazione JSON, o streaming su frontend.
 */
export class InMemoryTelemetryCollector implements AgentObserver {
  private events: AgentEvent[] = [];

  public onEvent(event: AgentEvent): void {
    this.events.push(event);
  }

  public getEvents(): readonly AgentEvent[] {
    return this.events;
  }

  public filterByType<T extends AgentEventType>(
    type: T
  ): Array<Extract<AgentEvent, { type: T }>> {
    return this.events.filter(
      (e): e is Extract<AgentEvent, { type: T }> => e.type === type
    );
  }

  /**
   * Estrae la sequenza ordinata di tutti i pensieri (thought) generati dal modello.
   */
  public getThoughts(): Array<{ macroCycle: number; tick: number; thought: string }> {
    const inferences = this.filterByType('model_inference');
    return inferences
      .filter((inf): inf is ModelInferenceEvent & { output: { thought: string } } =>
        typeof inf.output.thought === 'string' && inf.output.thought.trim().length > 0
      )
      .map((inf) => ({
        macroCycle: inf.macroCycle,
        tick: inf.tick,
        thought: inf.output.thought!
      }));
  }

  /**
   * Estrae tutte le azioni fisiche eseguite verso il Mondo esterno W.
   */
  public getWorldActions(): WorldActionEvent[] {
    return this.filterByType('world_action');
  }

  /**
   * Estrae tutte le azioni cognitive introspettive eseguite.
   */
  public getCognitiveActions(): CognitiveActionEvent[] {
    return this.filterByType('cognitive_action');
  }

  /**
   * Pulisce il buffer degli eventi.
   */
  public clear(): void {
    this.events = [];
  }

  /**
   * Estrae la timeline strutturata dello stato dell'agente ad ogni fase/passo,
   * pronta per essere ispezionata, salvata su file o analizzata in formato JSON.
   */
  public getStateTimeline(): Array<{
    step: number;
    macroCycle: number;
    tick: number;
    phase: string;
    directive: string;
    state: {
      I: string;
      Ms: string;
      Ds: DataRecord;
      Ta: string[];
      Ka: string[];
      messageCount: number;
    };
    thought?: string;
    calls: Array<{ id: string; name: string; payload: DataRecord }>;
  }> {
    const inferences = this.filterByType('model_inference');
    return inferences.map((inf, idx) => ({
      step: idx + 1,
      macroCycle: inf.macroCycle,
      tick: inf.tick,
      phase: inf.controlState,
      directive: inf.directive.type,
      state: {
        I: inf.stateSnapshot.I,
        Ms: inf.stateSnapshot.Ms,
        Ds: { ...inf.stateSnapshot.Ds },
        Ta: Array.from(inf.stateSnapshot.Ta),
        Ka: Array.from(inf.stateSnapshot.Ka ? inf.stateSnapshot.Ka.keys() : []),
        messageCount: inf.stateSnapshot.Ep.length
      },
      thought: inf.output.thought,
      calls: inf.output.calls.map((c) => ({
        id: c.id,
        name: c.name,
        payload: c.payload
      }))
    }));
  }

  /**
   * Esporta la cronologia completa dell'evoluzione dello stato ad ogni fase
   * in una stringa JSON formattata e leggibile.
   */
  public exportStateTimelineJSON(): string {
    return JSON.stringify(this.getStateTimeline(), null, 2);
  }

  /**
   * Serializza l'intera storia di telemetria in formato JSON,
   * convertendo correttamente Set e Map in strutture dati JSON native.
   */
  public toJSON(): string {
    return JSON.stringify(
      this.events,
      (_key, value) => {
        if (value instanceof Set) {
          return Array.from(value);
        }
        if (value instanceof Map) {
          return Object.fromEntries(value.entries());
        }
        if (value instanceof z.ZodType) {
          try {
            return z.toJSONSchema(value, { target: 'openapi-3.0' });
          } catch {
            return 'schema';
          }
        }
        return value;
      },
      2
    );
  }
}

