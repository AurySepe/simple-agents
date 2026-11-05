import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';
import { TransitionReasonCode } from '../../types/index.js';

export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  showThoughts?: boolean;
  showSystemFrame?: boolean;
  showVisibleTools?: boolean;
  showModelInputs?: boolean;
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
 * Fornisce metadati semantici e descrittivi sul tipo di passo in corso.
 */
function describeStepType(state: string): { title: string; category: string; description: string } {
  switch (state) {
    case 'q_intro':
      return {
        title: 'Pianificazione Interna',
        category: 'Introspezione Cognitiva',
        description: 'L\'agente consulta le policy, aggiorna la memoria di lavoro e prepara gli strumenti necessari.'
      };
    case 'q_exec':
      return {
        title: 'Azione Operativa',
        category: 'Esecuzione nel Mondo',
        description: 'L\'agente interagisce con l\'ambiente esterno chiamando servizi o emettendo la conclusione finale.'
      };
    case 'q_repair':
      return {
        title: 'Risoluzione Anomalia',
        category: 'Auto-Riparazione',
        description: 'L\'agente rileva parametri non conformi o tool non validi e auto-corregge la richiesta.'
      };
    case 'q_sleep':
      return {
        title: 'Attesa Input',
        category: 'Ibernazione',
        description: 'L\'agente è in attesa di una nuova richiesta o di risposte asincrone dai servizi esterni.'
      };
    case 'q_yield':
      return {
        title: 'Yield ai Servizi Esterni',
        category: 'Sospensione Operativa',
        description: 'L\'agente ha inviato le richieste e attende i risultati dal Mondo esterno.'
      };
    case 'q_halt':
      return {
        title: 'Obiettivo Concluso',
        category: 'Terminazione',
        description: 'L\'agente ha completato l\'incarico e restituito il risultato finale.'
      };
    default:
      return {
        title: state,
        category: 'Fase del Sistema',
        description: ''
      };
  }
}

/**
 * Traduce le direttive formali del protocollo in etichette e spiegazioni comprensibili.
 */
function humanizeDirectiveDetail(directive: {
  type: string;
  prompt?: string;
  targetToolId?: string;
}): { label: string; explanation: string } {
  switch (directive.type) {
    case 'start_intro':
      return {
        label: 'Inizio pianificazione',
        explanation: 'Analizzare la richiesta iniziale, consultare i concetti e montare gli strumenti operativi.'
      };
    case 'loop_intro':
      return {
        label: 'Affinamento piano e memoria',
        explanation: 'Elaborare i dati acquisiti, salvare le informazioni in memoria o concludere la preparazione.'
      };
    case 'start_exec':
      return {
        label: 'Esecuzione azioni nel mondo',
        explanation: 'Invocare i servizi esterni necessari o emettere il contratto di terminazione finale.'
      };
    case 'err_schema':
      return {
        label: 'Correzione parametri anomali',
        explanation: directive.targetToolId
          ? `Correggere la chiamata non valida sul tool '${directive.targetToolId}' o abortire l'azione.`
          : 'Correggere la chiamata non conforme o abortire.'
      };
    default:
      return {
        label: directive.type,
        explanation: ''
      };
  }
}

/**
 * Traduce i codici simbolici di transizione in descrizioni leggibili in linguaggio naturale.
 */
function humanizeTransitionReason(
  code: TransitionReasonCode,
  context?: Record<string, unknown>
): string {
  const toolId = context?.toolId ? `'${context.toolId}'` : '';
  switch (code) {
    case 'router_initial_intro':
      return 'avvio pianificazione preliminare';
    case 'router_initial_exec':
      return 'avvio diretto in azione operativa';
    case 'intro_concluded':
      return 'pianificazione completata con successo';
    case 'intro_empty_action':
      return 'nessuna operazione indicata';
    case 'intro_xor_violation':
      return 'conclusione pianificazione non separata dalle altre azioni';
    case 'intro_unauthorized_action':
      return toolId ? `azione non autorizzata: ${toolId}` : 'azione non autorizzata';
    case 'intro_unregistered_action':
      return toolId ? `azione non registrata: ${toolId}` : 'azione non registrata';
    case 'intro_action_execution_error':
      return toolId ? `errore parametri operazione mentale: ${toolId}` : 'errore parametri operazione';
    case 'exec_empty_calls':
      return 'nessuna azione o chiamata emessa in fase esecutiva';
    case 'exec_term_schema_error':
      return toolId ? `violazione schema contratto terminazione: ${toolId}` : 'violazione schema contratto terminazione';
    case 'exec_term_success':
      return toolId ? `terminazione con contratto ${toolId}` : 'terminazione con contratto';
    case 'exec_world_unmounted_tool':
      return toolId ? `servizio esterno non abilitato: ${toolId}` : 'servizio esterno non abilitato';
    case 'exec_world_schema_error':
      return toolId ? `parametri non conformi per il servizio esterno: ${toolId}` : 'parametri non conformi per il servizio';
    case 'exec_world_yield':
      return 'invio richieste e attesa risposta servizi esterni';
    case 'repair_abort_success':
      return 'recupero completato con abort';
    case 'repair_abort_yield':
      return 'recupero completato con abort da exec';
    case 'repair_retry_intro':
      return 'ritorno a pianificazione dopo correzione';
    case 'repair_retry_exec':
      return 'ritorno ad azione operativa dopo correzione';
    case 'manual_override':
      return 'forzatura manuale';
    case 'post_yield_sleep':
      return 'in attesa di nuovi input';
    default:
      return code;
  }
}

/**
 * Estrae l'ultimo input rilevante (richiesta utente o risposta da servizio esterno) dalla cronologia.
 */
function extractRecentInput(
  messages: Array<{ role: string; channel: string; callId?: string; content: unknown }>
): { label: string; data: unknown } | null {
  if (!messages || messages.length === 0) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'world' && msg.channel === 'result') {
      const ref = msg.callId ? ` [Rif: ${msg.callId}]` : '';
      return {
        label: `Risposta servizio esterno${ref}`,
        data: msg.content
      };
    }
    if (msg.role === 'user') {
      return {
        label: 'Richiesta Utente',
        data: msg.content
      };
    }
    if (msg.role === 'orchestrator' && msg.channel === 'result') {
      const ref = msg.callId ? ` [Rif: ${msg.callId}]` : '';
      return {
        label: `Esito operazione cognitiva${ref}`,
        data: msg.content
      };
    }
  }
  return null;
}

/**
 * ============================================================================
 * LOGGER DI CONSOLE STRUTTURATO E VISIVO (ConsoleLoggerObserver)
 * ============================================================================
 * Presenta l'avanzamento dell'agente in linguaggio naturale e accessibile:
 * - Mostra con chiarezza per ciascun passo il tipo di passo e la sua natura
 * - Mostra gli argomenti e il contesto forniti in ingresso alla chiamata al modello
 * - Mostra il flusso di coscienza (ragionamento interiore) generato dal modello
 * - Mostra le chiamate e azioni decise dal modello con i rispettivi argomenti
 * - Mostra gli esiti e le transizioni di stato in una narrazione fluida e comprensibile
 */
export class ConsoleLoggerObserver implements AgentObserver {
  private level: LogLevel;
  private showThoughts: boolean;
  private showSystemFrame: boolean;
  private showVisibleTools: boolean;
  private showModelInputs: boolean;
  private useColors: boolean;
  private prefix: string;
  private writer: (message: string) => void;

  constructor(options?: ConsoleLoggerOptions) {
    this.level = options?.level ?? 'info';
    this.showThoughts = options?.showThoughts ?? true;
    this.showSystemFrame = options?.showSystemFrame ?? false;
    this.showVisibleTools = options?.showVisibleTools ?? true;
    this.showModelInputs = options?.showModelInputs ?? true;
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

  private formatData(data: unknown, indent = 5): string {
    if (data === undefined) return this.dim('nessun dato');
    if (data === null) return this.dim('null');
    if (typeof data === 'string') return `"${data}"`;
    if (typeof data === 'number' || typeof data === 'boolean') return String(data);
    if (typeof data === 'object' && Object.keys(data as object).length === 0) {
      return Array.isArray(data) ? '[]' : '{}';
    }
    try {
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
        const border = '═'.repeat(Math.max(68, title.length + 4));

        this.write('');
        this.write(pfx + this.blue(`╔${border}╗`));
        this.write(pfx + this.blue(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.blue(`╚${border}╝`));

        if (event.userContent !== undefined) {
          this.write(pfx + `👤 ${this.bold('Richiesta Utente:')}`);
          this.write(pfx + `   ${this.cyan(this.formatData(event.userContent, 3))}`);
        }

        if (event.worldResults && event.worldResults.length > 0) {
          this.write(
            pfx +
              `🌍 ${this.bold('Risposte ricevute dai servizi esterni')} ${this.dim(
                `(${event.worldResults.length} esito/i)`
              )}:`
          );
          for (const res of event.worldResults) {
            this.write(
              pfx +
                `   • ${this.dim(`[Rif: ${res.callId}]`)} ${this.green(
                  this.formatData(res.result, 5)
                )}`
            );
          }
        }
        break;
      }

      case 'step_start': {
        const stepNum = event.tick + 1;
        const stepInfo = describeStepType(event.controlState);
        const directiveInfo = humanizeDirectiveDetail(event.directive);

        this.write('');
        this.write(pfx + this.cyan('─'.repeat(80)));
        this.write(
          pfx +
            this.bold(
              this.cyan(`PASSO ${stepNum} • ${stepInfo.title} (${stepInfo.category})`)
            )
        );
        this.write(pfx + this.cyan('─'.repeat(80)));
        this.write(pfx + `📌 ${this.bold('Natura del passo:')} ${this.dim(stepInfo.description)}`);
        this.write(
          pfx +
            `🎯 ${this.bold('Direttiva attiva:')} ${this.yellow(directiveInfo.label)} ${this.dim(
              `— ${directiveInfo.explanation}`
            )}`
        );
        break;
      }

      case 'model_inference': {
        // 1. Argomenti e Contesto forniti in ingresso al modello
        if (this.showModelInputs) {
          const recentInput = extractRecentInput(event.context.messages);
          const toolNames = event.context.visibleTools.map((t) => t.id).join(', ');

          this.write('');
          this.write(pfx + `📥 ${this.bold('Input e argomenti passati alla chiamata del modello:')}`);
          if (recentInput) {
            this.write(
              pfx +
                `   • ${this.bold(recentInput.label)}:\n` +
                `     ${this.cyan(this.formatData(recentInput.data, 5))}`
            );
          }
          if (this.showVisibleTools) {
            this.write(
              pfx +
                `   • ${this.bold('Strumenti utilizzabili in questo passo')} ${this.dim(
                  `(${event.context.visibleTools.length})`
                )}:\n` +
                `     [ ${this.dim(toolNames)} ]`
            );
          }
          if (this.showSystemFrame && this.level === 'verbose') {
            this.write(pfx + `   • ${this.bold('System Frame (Istruzioni di sistema):')}`);
            for (const line of event.context.systemFrame.split('\n')) {
              this.write(pfx + `     ${this.dim(line)}`);
            }
          }
        }

        // 2. Flusso di coscienza (Ragionamento del modello)
        if (this.showThoughts && event.output.thought) {
          this.write('');
          this.write(
            pfx +
              `💭 ${this.yellow(
                this.bold('Flusso di coscienza (Ragionamento dell\'Agente):')
              )}`
          );
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `   ${this.yellow(l)}`);
          }
        }

        // 3. Azioni e Chiamate decise dal modello con i rispettivi argomenti
        this.write('');
        if (event.output.calls.length > 0) {
          this.write(
            pfx +
              `⚡ ${this.bold('Chiamate decise dal modello')} ${this.dim(
                `(inferenza completata in ${event.durationMs}ms)`
              )}:`
          );
          for (let i = 0; i < event.output.calls.length; i++) {
            const call = event.output.calls[i];
            const num = event.output.calls.length > 1 ? `${i + 1}. ` : '• ';
            this.write(pfx + `   ${this.green(num)}${this.bold(call.name)}`);
            this.write(pfx + `     ${this.dim('Argomenti passati:')}`);
            this.write(pfx + `     ${this.cyan(this.formatData(call.payload, 7))}`);
          }
        } else {
          this.write(pfx + `⚡ ${this.dim('Nessuna chiamata a strumenti emessa dal modello in questo passo.')}`);
        }
        break;
      }

      case 'cognitive_action': {
        this.write('');
        this.write(
          pfx +
            `🧠 ${this.magenta('Operazione mentale eseguita:')} ${this.bold(
              event.toolName
            )} ${this.dim('➔')} ${this.green('completata con successo')}`
        );
        if (
          event.result !== undefined &&
          event.result !== null &&
          typeof event.result === 'object' &&
          Object.keys(event.result).length > 0
        ) {
          this.write(
            pfx + `   ${this.dim('Esito memorizzato:')} ${this.magenta(this.formatData(event.result, 5))}`
          );
        }
        break;
      }

      case 'state_transition': {
        const fromName = humanizeFSMState(event.from);
        const toName = humanizeFSMState(event.to);
        const reasonText = humanizeTransitionReason(event.reasonCode, event.context);
        const reasonStr = reasonText ? ` ${this.dim(`(motivo: ${reasonText})`)}` : '';
        this.write('');
        this.write(
          pfx +
            `🔀 ${this.bold('Cambio di fase:')} ${this.cyan(fromName)} ${this.dim(
              '➔'
            )} ${this.bold(this.cyan(toName))}${reasonStr}`
        );
        break;
      }

      case 'schema_error': {
        this.write('');
        this.write(
          pfx +
            `⚠️  ${this.red(this.bold('Anomalia nella chiamata'))} ${this.dim(
              `sull'azione '${event.targetToolId}':`
            )}`
        );
        this.write(pfx + `   ${this.red(event.errorDetail)}`);
        this.write(
          pfx +
            `   ${this.dim(
              'Avviata procedura di auto-riparazione per correggere i parametri.'
            )}`
        );
        break;
      }

      case 'yield': {
        const callsStr = event.pendingCalls.map((c) => this.bold(c.name)).join(', ');
        this.write('');
        this.write(
          pfx +
            `⏸️  ${this.yellow(this.bold('In attesa dei servizi esterni:'))} ${this.dim(
              'sospensione temporanea per l\'esecuzione di'
            )} [ ${callsStr} ]`
        );
        break;
      }

      case 'world_action': {
        this.write('');
        this.write(
          pfx +
            `🌍 ${this.green(this.bold('Esecuzione servizio esterno:'))} ${this.bold(
              this.green(event.toolId)
            )} ${this.dim(`(${event.durationMs}ms)`)}`
        );
        this.write(
          pfx + `   ${this.dim('Argomenti inviati:')} ${this.cyan(this.formatData(event.args, 5))}`
        );
        if (event.error) {
          this.write(
            pfx + `   ${this.red('❌ Errore:')} ${this.red(this.formatData(event.error, 5))}`
          );
        } else {
          this.write(
            pfx + `   ${this.green('✓ Risultato:')} ${this.green(this.formatData(event.result, 5))}`
          );
        }
        break;
      }

      case 'halt': {
        const title = ` OBIETTIVO COMPLETATO CON SUCCESSO (Esito: '${event.result.type}') `;
        const border = '═'.repeat(Math.max(68, title.length + 4));

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
