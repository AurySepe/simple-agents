import { AgentEvent } from './events.js';

/**
 * ============================================================================
 * INTERFACCIA OSSERVATORE (AgentObserver)
 * ============================================================================
 * Riceve gli eventi di telemetria emessi dall'automa agente.
 */
export interface AgentObserver {
  onEvent(event: AgentEvent): void | Promise<void>;
}

/**
 * Raggruppa molteplici osservatori ed esegue il dispatching a catena.
 */
export class CompositeObserver implements AgentObserver {
  private observers: AgentObserver[];

  constructor(observers: AgentObserver[] = []) {
    this.observers = [...observers];
  }

  public addObserver(observer: AgentObserver): void {
    this.observers.push(observer);
  }

  public removeObserver(observer: AgentObserver): void {
    const idx = this.observers.indexOf(observer);
    if (idx !== -1) {
      this.observers.splice(idx, 1);
    }
  }

  public async onEvent(event: AgentEvent): Promise<void> {
    for (const observer of this.observers) {
      try {
        await observer.onEvent(event);
      } catch (err) {
        // Un errore in un logger o telemetry listener non deve interrompere l'esecuzione dell'agente
        console.error('Errore nell\'esecuzione dell\'observer:', err);
      }
    }
  }
}

