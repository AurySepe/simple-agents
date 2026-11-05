import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';

export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  showThoughts?: boolean;
  showSystemFrame?: boolean;
  showVisibleTools?: boolean;
  prefix?: string;
  writer?: (message: string) => void;
}

/**
 * ============================================================================
 * LOGGER DI CONSOLE (ConsoleLoggerObserver)
 * ============================================================================
 * Stampa a video l'avanzamento dell'agente con formattazione strutturata,
 * icone ed evidenziazione dei cicli, pensieri, azioni e transizioni.
 */
export class ConsoleLoggerObserver implements AgentObserver {
  private level: LogLevel;
  private showThoughts: boolean;
  private showSystemFrame: boolean;
  private showVisibleTools: boolean;
  private prefix: string;
  private writer: (message: string) => void;

  constructor(options?: ConsoleLoggerOptions) {
    this.level = options?.level ?? 'info';
    this.showThoughts = options?.showThoughts ?? true;
    this.showSystemFrame = options?.showSystemFrame ?? false;
    this.showVisibleTools = options?.showVisibleTools ?? false;
    this.prefix = options?.prefix ?? '[Agent]';
    this.writer = options?.writer ?? ((msg: string) => console.log(msg));
  }

  public onEvent(event: AgentEvent): void {
    const time = `[c=${event.macroCycle}, t=${event.tick}]`;

    switch (event.type) {
      case 'macro_cycle_start': {
        this.write(`\n${this.prefix} === INIZIO CICLO MONDO c=${event.macroCycle} ===`);
        if (event.userContent) {
          this.write(`${this.prefix} 👤 Input Utente: ${JSON.stringify(event.userContent)}`);
        }
        if (event.worldResults && event.worldResults.length > 0) {
          this.write(`${this.prefix} 🌍 Risultati dal Mondo: ${event.worldResults.length} esiti ricevuti`);
        }
        break;
      }

      case 'step_start': {
        if (this.level === 'verbose') {
          this.write(`${this.prefix} ${time} ⚙️ Micro-passo in stato '${event.controlState}' (direttiva: ${event.directive.type})`);
        }
        break;
      }

      case 'model_inference': {
        if (this.showSystemFrame && this.level === 'verbose') {
          this.write(`${this.prefix} ${time} 📄 Frame Proiettato:\n${event.context.systemFrame}`);
        }
        if (this.showVisibleTools && this.level === 'verbose') {
          const toolIds = event.context.visibleTools.map((t) => t.id).join(', ');
          this.write(`${this.prefix} ${time} 👁️ Tool Visibili: [${toolIds}]`);
        }
        if (this.showThoughts && event.output.thought) {
          this.write(`${this.prefix} ${time} 💭 Pensiero: "${event.output.thought}"`);
        }
        if (event.output.calls.length > 0) {
          const callsStr = event.output.calls
            .map((c) => `${c.name}(${JSON.stringify(c.payload)})`)
            .join(', ');
          this.write(`${this.prefix} ${time} 📞 Chiamate LLM: ${callsStr} (${event.durationMs}ms)`);
        }
        break;
      }

      case 'cognitive_action': {
        this.write(
          `${this.prefix} ${time} 🧠 Azione Cognitiva: ${event.toolName} -> arg: ${JSON.stringify(
            event.args
          )}`
        );
        break;
      }

      case 'world_action': {
        if (event.error) {
          this.write(
            `${this.prefix} ${time} ❌ Errore Tool Mondo '${event.toolId}': ${JSON.stringify(
              event.error
            )} (${event.durationMs}ms)`
          );
        } else {
          this.write(
            `${this.prefix} ${time} 🌍 Esecuzione Tool Mondo: ${event.toolId}(${JSON.stringify(
              event.args
            )}) => ${JSON.stringify(event.result)} (${event.durationMs}ms)`
          );
        }
        break;
      }

      case 'state_transition': {
        if (this.level === 'verbose') {
          this.write(
            `${this.prefix} ${time} 🔀 Transizione FSM: ${event.from} -> ${event.to}${
              event.reason ? ` (${event.reason})` : ''
            }`
          );
        }
        break;
      }

      case 'schema_error': {
        this.write(
          `${this.prefix} ${time} ⚠️ Errore di Schema su '${event.targetToolId}': ${event.errorDetail} (avviata riparazione)`
        );
        break;
      }

      case 'yield': {
        const callsStr = event.pendingCalls.map((c) => c.name).join(', ');
        this.write(`${this.prefix} ${time} ⏸️ Cessione Controllo (Yield) al Mondo W per: [${callsStr}]`);
        break;
      }

      case 'halt': {
        this.write(
          `\n${this.prefix} ${time} 🏁 ARRESTO (Halt) con contratto: '${event.result.type}'`
        );
        this.write(`${this.prefix} 📦 Risultato Finale: ${JSON.stringify(event.result.payload, null, 2)}`);
        break;
      }
    }
  }

  private write(message: string): void {
    this.writer(message);
  }
}

/**
 * Factory helper per creare rapidamente un console observer.
 */
export function createConsoleObserver(options?: ConsoleLoggerOptions): ConsoleLoggerObserver {
  return new ConsoleLoggerObserver(options);
}

