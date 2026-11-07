import { z } from 'zod';
import {
  AgentEvent,
  ModelInferenceEvent,
  WorldActionEvent
} from '../events.js';
import { AgentObserver } from '../observer.js';
import { DataRecord } from '../../types/index.js';

export type AgentEventType = AgentEvent['type'];

/**
 * ============================================================================
 * RACCOLTA TELEMETRIA IN MEMORIA (InMemoryTelemetryCollector)
 * ============================================================================
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

  public getWorldActions(): WorldActionEvent[] {
    return this.filterByType('world_action');
  }

  public clear(): void {
    this.events = [];
  }

  public getStateTimeline(): Array<{
    step: number;
    macroCycle: number;
    tick: number;
    phase: string;
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

  public exportStateTimelineJSON(): string {
    return JSON.stringify(this.getStateTimeline(), null, 2);
  }

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
