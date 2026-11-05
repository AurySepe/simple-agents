import {
  AgentEvent,
  AgentEventType,
  CognitiveActionEvent,
  ModelInferenceEvent,
  WorldActionEvent
} from '../events.js';
import { AgentObserver } from '../observer.js';

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
   * Serializza l'intera storia di telemetria in formato JSON.
   */
  public toJSON(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

