import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';

export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  showThoughts?: boolean;
  showSystemFrame?: boolean;
  showVisibleTools?: boolean;
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
      return 'In attesa di input';
    case 'q_intro':
      return 'Pianificazione interna';
    case 'q_exec':
      return 'Azione operativa';
    case 'q_repair':
      return 'Riparazione automatica';
    case 'q_yield':
      return 'Attesa servizi esterni';
    case 'q_halt':
      return 'Completato';
    default:
      return state;
  }
}

/**
 * Traduce le direttive formali del protocollo in etichette comprensibili.
 */
function humanizeDirective(type: string): string {
  switch (type) {
    case 'start_intro':
      return 'Inizio pianificazione';
    case 'loop_intro':
      return 'Affinamento piano e memoria';
    case 'start_exec':
      return 'Esecuzione azioni nel mondo';
    case 'err_schema':
      return 'Risoluzione anomalia';
    default:
      return type;
  }
}

/**
 * ============================================================================
 * LOGGER DI CONSOLE STRUTTURATO E VISIVO (ConsoleLoggerObserver)
 * ============================================================================
 * Presenta l'avanzamento dell'agente in linguaggio naturale e accessibile,
 * con formattazione ad albero, box unicode e chiara separazione dei momenti operativi.
 */
export class ConsoleLoggerObserver implements AgentObserver {
  private level: LogLevel;
  private showThoughts: boolean;
  private showSystemFrame: boolean;
  private showVisibleTools: boolean;
  private useColors: boolean;
  private prefix: string;
  private writer: (message: string) => void;

  constructor(options?: ConsoleLoggerOptions) {
    this.level = options?.level ?? 'info';
    this.showThoughts = options?.showThoughts ?? true;
    this.showSystemFrame = options?.showSystemFrame ?? false;
    this.showVisibleTools = options?.showVisibleTools ?? false;
    this.useColors = options?.useColors ?? true;
    this.prefix = options?.prefix ?? '';
    this.writer = options?.writer ?? ((msg: string) => console.log(msg));
  }

  // --- Utility per formattazione e colori ANSI ---
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

  private magenta(text: string): string {
    return this.c('\x1b[35m', text);
  }

  private blue(text: string): string {
    return this.c('\x1b[34m', text);
  }

  private red(text: string): string {
    return this.c('\x1b[31m', text);
  }

  private formatData(data: unknown, indent = 6): string {
    if (data === undefined) return this.dim('nessun dato');
    if (typeof data === 'string') return `"${data}"`;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
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
        const cycleNum = event.macroCycle + 1;
        const title = ` CICLO OPERATIVO ${cycleNum} `;
        const border = '═'.repeat(Math.max(64, title.length + 4));

        this.write('');
        this.write(pfx + this.blue(`╔${border}╗`));
        this.write(pfx + this.blue(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.blue(`╚${border}╝`));

        if (event.userContent !== undefined) {
          this.write(pfx + `   ${this.bold('👤 Richiesta Utente:')}`);
          this.write(pfx + `      ${this.cyan(this.formatData(event.userContent, 6))}`);
        }

        if (event.worldResults && event.worldResults.length > 0) {
          this.write(
            pfx +
              `   ${this.bold('🌍 Risposte ricevute dai servizi esterni')} ${this.dim(
                `(${event.worldResults.length} esito/i)`
              )}:`
          );
          for (const res of event.worldResults) {
            this.write(
              pfx +
                `      ${this.green('•')} ${this.dim(`[Rif: ${res.callId}]`)} ${this.green(
                  this.formatData(res.result, 8)
                )}`
            );
          }
        }
        break;
      }

      case 'step_start': {
        if (this.level === 'verbose') {
          const stepNum = event.tick + 1;
          const phase = humanizeFSMState(event.controlState);
          const directiveDesc = humanizeDirective(event.directive.type);
          this.write(
            pfx +
              `  ${this.cyan('┌──')} ${this.bold(`Passo ${stepNum}`)} ${this.dim(
                `[Fase: ${phase} • ${directiveDesc}]`
              )}`
          );
        }
        break;
      }

      case 'model_inference': {
        const pipe = this.cyan('  │  ');

        if (this.showSystemFrame && this.level === 'verbose') {
          this.write(pfx + `${pipe}${this.dim('📄 Contesto operativo:')}`);
          for (const line of event.context.systemFrame.split('\n')) {
            this.write(pfx + `${pipe}  ${this.dim(line)}`);
          }
        }

        if (this.showVisibleTools && this.level === 'verbose') {
          const toolNames = event.context.visibleTools.map((t) => t.id).join(', ');
          this.write(
            pfx + `${pipe}${this.dim(`🛠️  Strumenti disponibili in questa fase: [${toolNames}]`)}`
          );
        }

        if (this.showThoughts && event.output.thought) {
          this.write(pfx + `${pipe}`);
          this.write(pfx + `${pipe}${this.yellow(this.bold('💭 Ragionamento dell\'Agente:'))}`);
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `${pipe}   ${this.yellow(this.c('\x1b[3m', `"${l}"`))}`);
          }
        }

        if (event.output.calls.length > 0) {
          this.write(pfx + `${pipe}`);
          this.write(
            pfx +
              `${pipe}${this.bold('📞 Azioni stabilite dall\'Agente')} ${this.dim(
                `(${event.durationMs}ms)`
              )}:`
          );
          for (const call of event.output.calls) {
            this.write(
              pfx +
                `${pipe}   ${this.cyan('•')} ${this.bold(call.name)}${this.dim('(')}${this.cyan(
                  this.formatData(call.payload, 8)
                )}${this.dim(')')}`
            );
          }
        }
        break;
      }

      case 'cognitive_action': {
        const pipe = this.cyan('  │  ');
        this.write(
          pfx +
            `${pipe}   ${this.magenta('🧠')} ${this.dim('Operazione mentale:')} ${this.bold(
              event.toolName
            )}${this.dim('(')}${this.magenta(
              this.formatData(event.args, 8)
            )}${this.dim(')')} ${this.dim('➔')} ${this.green('completata')}`
        );
        break;
      }

      case 'state_transition': {
        if (this.level === 'verbose') {
          const fromName = humanizeFSMState(event.from);
          const toName = humanizeFSMState(event.to);
          const reasonStr = event.reason ? ` ${this.dim(`(${event.reason})`)}` : '';
          this.write(
            pfx +
              `  ${this.cyan('└──')} ${this.yellow('🔀')} ${this.bold(
                'Cambio fase:'
              )} ${this.cyan(fromName)} ${this.dim('➔')} ${this.bold(
                this.cyan(toName)
              )}${reasonStr}\n`
          );
        }
        break;
      }

      case 'schema_error': {
        const pipe = this.red('  │  ');
        this.write(pfx + `${pipe}`);
        this.write(
          pfx +
            `${pipe}${this.red(this.bold('⚠️  Richiesta non conforme'))} ${this.dim(
              `sull'azione '${event.targetToolId}':`
            )}`
        );
        this.write(pfx + `${pipe}   ${this.red(event.errorDetail)}`);
        this.write(
          pfx +
            `${pipe}   ${this.dim(
              'Avviata procedura di auto-correzione prima di procedere.'
            )}`
        );
        break;
      }

      case 'yield': {
        const callsStr = event.pendingCalls.map((c) => this.bold(c.name)).join(', ');
        this.write(
          pfx +
            `  ${this.cyan('└──')} ${this.yellow('⏸️  In attesa dei servizi esterni')} ${this.dim(
              'per l\'esecuzione di:'
            )} [ ${callsStr} ]\n`
        );
        break;
      }

      case 'world_action': {
        this.write(
          pfx +
            `   ${this.green('🌍 Esecuzione servizio esterno:')} ${this.bold(
              this.green(event.toolId)
            )} ${this.dim(`(${event.durationMs}ms)`)}`
        );
        this.write(
          pfx + `      ${this.dim('├─ Parametri inviati: ')} ${this.cyan(this.formatData(event.args, 9))}`
        );
        if (event.error) {
          this.write(
            pfx +
              `      ${this.red('└─ ❌ Errore riscontrato:')} ${this.red(
                this.formatData(event.error, 9)
              )}`
          );
        } else {
          this.write(
            pfx +
              `      ${this.green('└─ Risultato ottenuto:')} ${this.green(
                this.formatData(event.result, 9)
              )}`
          );
        }
        this.write('');
        break;
      }

      case 'halt': {
        const title = ` OBIETTIVO COMPLETATO CON SUCCESSO (Esito: '${event.result.type}') `;
        const border = '═'.repeat(Math.max(64, title.length + 4));

        this.write('');
        this.write(pfx + this.green(`╔${border}╗`));
        this.write(pfx + this.green(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.green(`╚${border}╝`));

        this.write(pfx + `   ${this.bold('📦 Risposta Finale Strutturata:')}`);
        const formattedResult = JSON.stringify(event.result.payload, null, 2);
        for (const line of formattedResult.split('\n')) {
          this.write(pfx + `      ${this.green(line)}`);
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

/**
 * Factory helper per creare rapidamente un console observer strutturato.
 */
export function createConsoleObserver(options?: ConsoleLoggerOptions): ConsoleLoggerObserver {
  return new ConsoleLoggerObserver(options);
}
