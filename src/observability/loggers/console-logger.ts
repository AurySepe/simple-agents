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
 * ============================================================================
 * LOGGER DI CONSOLE STRUTTURATO E VISIVO (ConsoleLoggerObserver)
 * ============================================================================
 * Formatta l'avanzamento dell'automa con gerarchia ad albero, box unicode,
 * stili visuali e netta separazione tra ragionamenti interni, azioni cognitive
 * e interazioni fisiche con il Mondo esterno.
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
    if (data === undefined) return this.dim('undefined');
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
        const title = ` INIZIO CICLO MONDO c = ${event.macroCycle} `;
        const border = '═'.repeat(Math.max(60, title.length + 4));

        this.write('');
        this.write(pfx + this.blue(`╔${border}╗`));
        this.write(pfx + this.blue(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.blue(`╚${border}╝`));

        if (event.userContent !== undefined) {
          this.write(pfx + `   ${this.bold('👤 Input Utente:')}`);
          this.write(pfx + `      ${this.cyan(this.formatData(event.userContent, 6))}`);
        }

        if (event.worldResults && event.worldResults.length > 0) {
          this.write(
            pfx +
              `   ${this.bold('🌍 Risultati ricevuti dal Mondo W')} ${this.dim(
                `(${event.worldResults.length} esiti)`
              )}:`
          );
          for (const res of event.worldResults) {
            this.write(
              pfx +
                `      ${this.green('•')} ${this.dim(`[callId: ${res.callId}]`)} ${this.green(
                  this.formatData(res.result, 8)
                )}`
            );
          }
        }
        break;
      }

      case 'step_start': {
        if (this.level === 'verbose') {
          this.write(
            pfx +
              `  ${this.cyan('┌──')} ${this.bold(`Passo [t=${event.tick}]`)} ${this.dim(
                `[FSM: ${event.controlState} | Direttiva: ${event.directive.type}]`
              )}`
          );
        }
        break;
      }

      case 'model_inference': {
        const pipe = this.cyan('  │  ');

        if (this.showSystemFrame && this.level === 'verbose') {
          this.write(pfx + `${pipe}${this.dim('📄 Frame Proiettato:')}`);
          for (const line of event.context.systemFrame.split('\n')) {
            this.write(pfx + `${pipe}  ${this.dim(line)}`);
          }
        }

        if (this.showVisibleTools && this.level === 'verbose') {
          const toolNames = event.context.visibleTools.map((t) => t.id).join(', ');
          this.write(pfx + `${pipe}${this.dim(`👁️  Tool Visibili: [${toolNames}]`)}`);
        }

        if (this.showThoughts && event.output.thought) {
          this.write(pfx + `${pipe}`);
          this.write(pfx + `${pipe}${this.yellow(this.bold('💭 Pensiero:'))}`);
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `${pipe}   ${this.yellow(this.c('\x1b[3m', `"${l}"`))}`);
          }
        }

        if (event.output.calls.length > 0) {
          this.write(pfx + `${pipe}`);
          this.write(
            pfx +
              `${pipe}${this.bold('📞 Decisione Modello')} ${this.dim(
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
            `${pipe}${this.magenta('🧠')} ${this.bold(event.toolName)}${this.dim('(')}${this.magenta(
              this.formatData(event.args, 8)
            )}${this.dim(')')} ${this.dim('➔')} ${this.green(this.formatData(event.result))}`
        );
        break;
      }

      case 'state_transition': {
        if (this.level === 'verbose') {
          const reasonStr = event.reason ? ` ${this.dim(`(${event.reason})`)}` : '';
          this.write(
            pfx +
              `  ${this.cyan('└──')} ${this.yellow('🔀')} ${this.bold(
                'Transizione FSM:'
              )} ${this.cyan(event.from)} ${this.dim('➔')} ${this.bold(
                this.cyan(event.to)
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
            `${pipe}${this.red(this.bold('⚠️  Errore di Schema'))} ${this.dim(
              `su '${event.targetToolId}':`
            )}`
        );
        this.write(pfx + `${pipe}   ${this.red(event.errorDetail)}`);
        this.write(pfx + `${pipe}   ${this.dim('Avviata procedura di riparazione in q_repair.')}`);
        break;
      }

      case 'yield': {
        const callsStr = event.pendingCalls.map((c) => this.bold(c.name)).join(', ');
        this.write(
          pfx +
            `  ${this.cyan('└──')} ${this.yellow('⏸️  Cessione Controllo (Yield)')} ${this.dim(
              'in attesa del Mondo W per:'
            )} [ ${callsStr} ]\n`
        );
        break;
      }

      case 'world_action': {
        this.write(
          pfx +
            `   ${this.green('🌍 Esecuzione Tool Mondo:')} ${this.bold(
              this.green(event.toolId)
            )} ${this.dim(`(${event.durationMs}ms)`)}`
        );
        this.write(
          pfx + `      ${this.dim('├─ Input: ')} ${this.cyan(this.formatData(event.args, 9))}`
        );
        if (event.error) {
          this.write(
            pfx + `      ${this.red('└─ ❌ Errore:')} ${this.red(this.formatData(event.error, 9))}`
          );
        } else {
          this.write(
            pfx +
              `      ${this.green('└─ Risultato:')} ${this.green(this.formatData(event.result, 9))}`
          );
        }
        this.write('');
        break;
      }

      case 'halt': {
        const title = ` ARRESTO (Halt) con contratto: '${event.result.type}' `;
        const border = '═'.repeat(Math.max(60, title.length + 4));

        this.write('');
        this.write(pfx + this.green(`╔${border}╗`));
        this.write(pfx + this.green(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.green(`╚${border}╝`));

        this.write(pfx + `   ${this.bold('📦 Risultato Finale Tipizzato:')}`);
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
