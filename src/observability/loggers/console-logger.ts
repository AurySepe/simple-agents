import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';
import { AgentState, DataRecord, Message, TransitionReasonCode } from '../../types/index.js';

export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  showThoughts?: boolean;
  showSystemFrame?: boolean;
  showVisibleTools?: boolean;
  showModelInputs?: boolean;
  showState?: boolean;
  showStateChangesOnly?: boolean;
  showRoutineTransitions?: boolean;
  useColors?: boolean;
  prefix?: string;
  writer?: (message: string) => void;
}

/**
 * Traduce gli identificatori tecnici FSM in espressioni chiare in linguaggio naturale.
 */
function humanizeFSMState(state: string): string {
  switch (state) {
    case 'q_sleep':
      return 'In attesa di stimolo';
    case 'q_exec':
      return 'Deliberazione operativa';
    case 'q_repair':
      return 'Riparazione schema';
    case 'q_yield':
      return 'Attesa servizi esterni';
    case 'q_halt':
      return 'Completato';
    default:
      return state;
  }
}

/**
 * Traduce i codici simbolici di transizione in descrizioni concise.
 */
function humanizeTransitionReason(
  code: TransitionReasonCode,
  context?: DataRecord
): string {
  const toolId = context?.toolId ? `'${context.toolId}'` : '';
  switch (code) {
    case 'stimulus_received':
      return 'ricezione stimolo utente';
    case 'exec_world_yield':
      return 'invio chiamate a tool di mondo e attesa esiti';
    case 'exec_term_success':
      return toolId ? `terminazione con contratto ${toolId}` : 'terminazione con contratto';
    case 'exec_schema_error':
      return toolId ? `parametri non conformi per: ${toolId}` : 'errore parametri schema';
    case 'exec_syntax_error':
      return toolId ? `sintassi JSON non valida per: ${toolId}` : 'errore sintassi JSON';
    case 'repair_success':
      return 'riparazione schema completata con successo';
    case 'repair_abort':
      return 'chiamata non valida annullata';
    case 'post_yield_exec':
      return 'ricezione esiti da servizi esterni e ripresa deliberazione';
    case 'manual_override':
      return 'modifica manuale di stato';
    default:
      return code;
  }
}

function formatCall(name: string, payload: DataRecord): string {
  if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
    return `${name}()`;
  }
  const json = JSON.stringify(payload);
  if (json.length < 65) {
    return `${name}(${json})`;
  }
  const formatted = JSON.stringify(payload, null, 2);
  const indented = formatted
    .split('\n')
    .map((line, idx) => (idx === 0 ? line : '     ' + line))
    .join('\n');
  return `${name}(\n     ${indented}\n   )`;
}

export class ConsoleLoggerObserver implements AgentObserver {
  private level: LogLevel;
  private showThoughts: boolean;
  private showSystemFrame: boolean;
  private showVisibleTools: boolean;
  private showModelInputs: boolean;
  private showState: boolean;
  private showStateChangesOnly: boolean;
  private showRoutineTransitions: boolean;
  private useColors: boolean;
  private prefix: string;
  private writer: (message: string) => void;

  private lastStateSignature?: string;

  constructor(options?: ConsoleLoggerOptions) {
    this.level = options?.level ?? 'info';
    this.showThoughts = options?.showThoughts ?? true;
    this.showSystemFrame = options?.showSystemFrame ?? false;
    this.showVisibleTools = options?.showVisibleTools ?? false;
    this.showModelInputs = options?.showModelInputs ?? false;
    this.showState = options?.showState ?? true;
    this.showStateChangesOnly = options?.showStateChangesOnly ?? true;
    this.showRoutineTransitions = options?.showRoutineTransitions ?? false;
    this.useColors = options?.useColors ?? true;
    this.prefix = options?.prefix ?? '';
    this.writer = options?.writer ?? ((msg: string) => console.log(msg));
  }

  private getStateSignature(s: AgentState): string {
    const dsStr = JSON.stringify(s.Ds);
    const taStr = Array.from(s.Ta).sort().join(',');
    const kaStr = Array.from(s.Ka.keys()).sort().join(',');
    return `${s.Ms}|${dsStr}|${taStr}|${kaStr}`;
  }

  private c(colorCode: string, text: string): string {
    if (!this.useColors) return text;
    return `${colorCode}${text}\x1b[0m`;
  }

  private bold(text: string): string {
    return this.c('\x1b[1m', text);
  }

  private dim(text: string): string {
    return this.c('\x1b[2m', text);
  }

  private cyan(text: string): string {
    return this.c('\x1b[36m', text);
  }

  private green(text: string): string {
    return this.c('\x1b[32m', text);
  }

  private yellow(text: string): string {
    return this.c('\x1b[33m', text);
  }

  private red(text: string): string {
    return this.c('\x1b[31m', text);
  }

  private formatData(data: unknown, indent = 5): string {
    if (data === undefined) return this.dim('nessun dato');
    if (data === null) return this.dim('null');
    if (typeof data === 'string') return `"${data}"`;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) {
      return Array.isArray(data) ? '[]' : '{}';
    }
    try {
      const compact = JSON.stringify(data);
      if (compact.length < 80) {
        return compact;
      }
      const formatted = JSON.stringify(data, null, 2);
      return formatted
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : ' '.repeat(indent) + line))
        .join('\n');
    } catch {
      return String(data);
    }
  }

  public onEvent(event: AgentEvent): void {
    const pfx = this.prefix ? `${this.prefix} ` : '';

    switch (event.type) {
      case 'macro_cycle_start': {
        // Mostra solo la richiesta utente iniziale senza banner o duplicazioni degli esiti di mondo
        if (event.userContent !== undefined) {
          this.write(pfx + `👤 ${this.bold('Utente:')} ${this.cyan(this.formatData(event.userContent, 3))}`);
        }
        break;
      }

      case 'step_start': {
        const stepNum = event.tick + 1;

        // Indicatore discreto e minimale per l'avanzamento dei passi
        this.write('');
        this.write(pfx + this.bold(this.cyan(`▶ [Passo ${stepNum}]`)));

        // Lo stato dell'agente si stampa solo all'avvio o in caso di mutazione reale
        if (this.showState && event.stateSnapshot) {
          const s = event.stateSnapshot;
          const currentSig = this.getStateSignature(s);
          const isInitial = this.lastStateSignature === undefined;
          const hasChanged = !isInitial && currentSig !== this.lastStateSignature;

          if (isInitial || hasChanged || !this.showStateChangesOnly) {
            this.lastStateSignature = currentSig;
            const stateHeader = isInitial
              ? 'Stato Iniziale:'
              : 'Stato Aggiornato:';

            this.write(pfx + `  🧠 ${this.bold(stateHeader)}`);
            this.write(pfx + `     • ${this.bold('Missione:')} ${this.cyan(`"${s.Ms}"`)}`);

            const dsKeys = Object.keys(s.Ds);
            if (dsKeys.length > 0) {
              const compactDs = JSON.stringify(s.Ds);
              this.write(pfx + `     • ${this.bold('Dati:')} ${this.cyan(compactDs)}`);
            }

            const taList = Array.from(s.Ta);
            if (taList.length > 0) {
              this.write(pfx + `     • ${this.bold('Tool:')} ${this.cyan(`[ ${taList.join(', ')} ]`)}`);
            }

            if (s.Ka && s.Ka.size > 0) {
              const kaList = Array.from(s.Ka.keys());
              this.write(pfx + `     • ${this.bold('Conoscenza:')} ${this.cyan(`[ ${kaList.join(', ')} ]`)}`);
            }
          }
        }
        break;
      }

      case 'model_inference': {
        // Pensiero deliberativo dell'agente (se presente)
        if (this.showThoughts && event.output.thought) {
          this.write(pfx + `  💭 ${this.yellow(this.bold('Pensiero:'))}`);
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `     ${this.yellow(l)}`);
          }
        }

        // Azione/i decise dal modello
        if (event.output.calls.length > 0) {
          for (const call of event.output.calls) {
            this.write(pfx + `  ⚡ ${this.green(this.bold('Azione:'))} ${this.green(formatCall(call.name, call.payload))}`);
          }
        } else {
          this.write(pfx + `  ⚡ ${this.dim('Nessuna azione emessa')}`);
        }
        break;
      }

      case 'state_transition': {
        const isRoutine =
          event.reasonCode === 'stimulus_received' ||
          event.reasonCode === 'exec_world_yield' ||
          event.reasonCode === 'post_yield_exec' ||
          event.reasonCode === 'exec_term_success';

        if (!isRoutine || this.showRoutineTransitions) {
          const toName = humanizeFSMState(event.to);
          const reasonText = humanizeTransitionReason(event.reasonCode, event.context);
          const reasonStr = reasonText ? ` ${this.dim(`(${reasonText})`)}` : '';
          this.write(
            pfx +
              `  🔀 ${this.bold('Transizione:')} ${this.bold(this.cyan(toName))}${reasonStr}`
          );
        }
        break;
      }

      case 'world_action': {
        const ms = event.durationMs !== undefined ? this.dim(` (${event.durationMs}ms)`) : '';
        if (event.error) {
          this.write(
            pfx +
              `  🌍 ${this.bold(event.toolId)}${ms} ${this.red('→ Errore:')} ${this.red(
                this.formatData(event.error, 5)
              )}`
          );
        } else {
          this.write(
            pfx +
              `  🌍 ${this.bold(event.toolId)}${ms} ${this.green('→')} ${this.green(
                this.formatData(event.result, 5)
              )}`
          );
        }
        break;
      }

      case 'tool_error': {
        this.write(
          pfx +
            `  ⚠️  ${this.red(this.bold('Errore Tool'))} ${this.dim(
              `'${event.targetToolId}':`
            )} ${this.red(event.errorPayload.message)}`
        );
        break;
      }

      case 'halt': {
        this.write('');
        this.write(pfx + this.bold(this.green(`🎉 [Completato - ${event.result.type}]`)));
        const formattedResult = JSON.stringify(event.result.payload, null, 2);
        for (const line of formattedResult.split('\n')) {
          this.write(pfx + `   ${this.green(line)}`);
        }
        this.write('');
        break;
      }
    }
  }

  private write(message: string): void {
    this.writer(message);
  }
}

export function createConsoleObserver(options?: ConsoleLoggerOptions): ConsoleLoggerObserver {
  return new ConsoleLoggerObserver(options);
}
