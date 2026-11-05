import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';
import { AgentState, TransitionReasonCode } from '../../types/index.js';

export type LogLevel = 'verbose' | 'info' | 'warn' | 'error';

export interface ConsoleLoggerOptions {
  level?: LogLevel;
  showThoughts?: boolean;
  showSystemFrame?: boolean;
  showVisibleTools?: boolean;
  showModelInputs?: boolean;
  showState?: boolean;
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
function humanizeDirectiveLabel(directive: { type: string; targetToolId?: string }): string {
  switch (directive.type) {
    case 'start_intro':
      return 'Inizio pianificazione (analisi richiesta, ricerca tool e policy)';
    case 'loop_intro':
      return 'Affinamento memoria e piano interno';
    case 'start_exec':
      return 'Esecuzione azioni nel Mondo esterno';
    case 'err_schema':
      return directive.targetToolId
        ? `Correzione parametri non conformi su '${directive.targetToolId}'`
        : 'Correzione parametri anomali';
    default:
      return directive.type;
  }
}

/**
 * Traduce i codici simbolici di transizione in descrizioni concise.
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
      return 'pianificazione completata';
    case 'intro_empty_action':
      return 'nessuna operazione indicata';
    case 'intro_xor_violation':
      return 'conclusione pianificazione non separata dalle altre azioni';
    case 'intro_unauthorized_action':
      return toolId ? `azione non autorizzata: ${toolId}` : 'azione non autorizzata';
    case 'intro_unregistered_action':
      return toolId ? `azione non registrata: ${toolId}` : 'azione non registrata';
    case 'intro_action_execution_error':
      return toolId ? `errore operazione mentale: ${toolId}` : 'errore operazione';
    case 'exec_empty_calls':
      return 'nessuna chiamata emessa in fase esecutiva';
    case 'exec_term_schema_error':
      return toolId ? `violazione contratto terminazione: ${toolId}` : 'violazione terminazione';
    case 'exec_term_success':
      return toolId ? `terminazione con contratto ${toolId}` : 'terminazione con contratto';
    case 'exec_world_unmounted_tool':
      return toolId ? `servizio esterno non abilitato: ${toolId}` : 'servizio non abilitato';
    case 'exec_world_schema_error':
      return toolId ? `parametri non conformi per: ${toolId}` : 'parametri non conformi';
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
 * Formatta in modo compatto il contenuto di un messaggio per l'estratto di cronologia.
 */
function formatMessageContent(content: unknown): string {
  if (content === undefined || content === null) return '';
  if (typeof content === 'string') {
    const singleLine = content.replace(/\s+/g, ' ').trim();
    return singleLine.length > 95 ? `"${singleLine.slice(0, 92)}..."` : `"${singleLine}"`;
  }
  const json = JSON.stringify(content);
  return json.length > 95 ? `${json.slice(0, 92)}...` : json;
}

/**
 * Estrae e formatta gli ultimi N messaggi dalla cronologia Ep.
 */
function formatRecentMessages(
  messages: Array<{ role: string; channel: string; callId?: string; content: unknown }>,
  maxCount = 3
): string[] {
  if (!messages || messages.length === 0) {
    return ['(nessun messaggio presente in cronologia)'];
  }

  const lines: string[] = [];
  const total = messages.length;
  const startIdx = Math.max(0, total - maxCount);

  if (startIdx > 0) {
    lines.push(`... (${startIdx} messaggi precedenti omessi)`);
  }

  for (let i = startIdx; i < total; i++) {
    const msg = messages[i];
    const callRef = msg.callId ? ` [${msg.callId}]` : '';
    const tag = `[${msg.role}:${msg.channel}${callRef}]`;
    const formattedContent = formatMessageContent(msg.content);
    lines.push(`${tag} ${formattedContent}`);
  }

  return lines;
}

/**
 * Formatta in modo compatto o multi-linea una chiamata di tool con i suoi argomenti.
 */
function formatCall(name: string, payload: unknown): string {
  if (!payload || (typeof payload === 'object' && Object.keys(payload as object).length === 0)) {
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

/**
 * ============================================================================
 * LOGGER DI CONSOLE ESSENZIALE, TRASPARENTE E CENTRATO SUI DATI
 * ============================================================================
 * Mostra ad ogni passo:
 * 1. Da cosa è composto lo STATO dell'Agente prima del passo (Ms, Ds, Ta, Ka)
 * 2. Cosa viene effettivamente PASSATO al modello (input, direttiva, tool)
 * 3. Il FLUSSO DI COSCIENZA del modello (thought)
 * 4. Le CHIAMATE e ARGOMENTI decisi dal modello
 * 5. Gli ESITI dei servizi esterni e le transizioni
 */
export class ConsoleLoggerObserver implements AgentObserver {
  private level: LogLevel;
  private showThoughts: boolean;
  private showSystemFrame: boolean;
  private showVisibleTools: boolean;
  private showModelInputs: boolean;
  private showState: boolean;
  private useColors: boolean;
  private prefix: string;
  private writer: (message: string) => void;

  constructor(options?: ConsoleLoggerOptions) {
    this.level = options?.level ?? 'info';
    this.showThoughts = options?.showThoughts ?? true;
    this.showSystemFrame = options?.showSystemFrame ?? true;
    this.showVisibleTools = options?.showVisibleTools ?? true;
    this.showModelInputs = options?.showModelInputs ?? true;
    this.showState = options?.showState ?? true;
    this.useColors = options?.useColors ?? true;
    this.prefix = options?.prefix ?? '';
    this.writer = options?.writer ?? ((msg: string) => console.log(msg));
  }

  // --- Utility ANSI ---
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
      const compact = JSON.stringify(data);
      if (compact.length < 65) {
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
          this.write(pfx + `👤 ${this.bold('Richiesta Utente:')} ${this.cyan(this.formatData(event.userContent, 3))}`);
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
                `   • ${this.dim(`[${res.callId}]`)} ${this.green(
                  this.formatData(res.result, 5)
                )}`
            );
          }
        }
        break;
      }

      case 'step_start': {
        const stepNum = event.tick + 1;
        const phase = humanizeFSMState(event.controlState);

        this.write('');
        this.write(pfx + this.bold(this.cyan(`▶ PASSO ${stepNum} [${phase}]`)));

        // 1. STATO DELL'AGENTE PRIMA DEL PASSO (Ms, Ds, Ta, Ka)
        if (this.showState && event.stateSnapshot) {
          const s = event.stateSnapshot;
          this.write(pfx + `  🧠 ${this.bold('Stato Agente prima del passo:')}`);
          this.write(pfx + `     • ${this.bold('Scopo (Ms):')} ${this.cyan(`"${s.Ms}"`)}`);

          const dsKeys = Object.keys(s.Ds);
          if (dsKeys.length === 0) {
            this.write(pfx + `     • ${this.bold('Memoria (Ds):')} ${this.dim('{} (vuota)')}`);
          } else {
            const compactDs = JSON.stringify(s.Ds);
            if (compactDs.length < 65) {
              this.write(pfx + `     • ${this.bold('Memoria (Ds):')} ${this.cyan(compactDs)}`);
            } else {
              this.write(pfx + `     • ${this.bold('Memoria (Ds):')}`);
              for (const line of JSON.stringify(s.Ds, null, 2).split('\n')) {
                this.write(pfx + `         ${this.cyan(line)}`);
              }
            }
          }

          const taList = Array.from(s.Ta);
          this.write(
            pfx +
              `     • ${this.bold('Tool attivi (Ta):')} ${
                taList.length > 0
                  ? this.cyan(`[ ${taList.join(', ')} ]`)
                  : this.dim('[ ] (nessun tool montato)')
              }`
          );

          if (s.Ka && s.Ka.size > 0) {
            const kaList = Array.from(s.Ka.keys());
            this.write(pfx + `     • ${this.bold('Policy attive (Ka):')} ${this.cyan(`[ ${kaList.join(', ')} ]`)}`);
          }
        }
        break;
      }

      case 'model_inference': {
        // 2. COSA VIENE PASSATO AL MODELLO (F_Ω, Ep, V_Ω)
        if (this.showModelInputs) {
          const toolNames = event.context.visibleTools.map((t) => t.id).join(', ');
          const directiveLabel = humanizeDirectiveLabel(event.directive);
          const totalMsgs = event.context.messages.length;
          const recentMsgs = formatRecentMessages(event.context.messages, 3);

          this.write(pfx + `  📥 ${this.bold('Cosa riceve il modello in questa chiamata:')}`);
          this.write(pfx + `     • ${this.bold('Direttiva / Guida:')} ${this.yellow(directiveLabel)}`);

          // Frame di sistema usato (F_Ω)
          if (this.showSystemFrame) {
            this.write(pfx + `     • ${this.bold('Frame di sistema usato (F_Ω):')}`);
            for (const line of event.context.systemFrame.split('\n')) {
              this.write(pfx + `       ${this.dim(line)}`);
            }
          }

          // Cronologia messaggi (estratto degli ultimi messaggi)
          const msgHeader = totalMsgs > 3
            ? `Cronologia messaggi (ultimi 3 di ${totalMsgs}):`
            : `Cronologia messaggi (${totalMsgs}):`;
          this.write(pfx + `     • ${this.bold(msgHeader)}`);
          for (const ml of recentMsgs) {
            this.write(pfx + `       ${this.cyan(ml)}`);
          }

          // Tool disponibili (V_Ω)
          if (this.showVisibleTools) {
            this.write(
              pfx +
                `     • ${this.bold('Tool disponibili (V_Ω)')} ${this.dim(
                  `(${event.context.visibleTools.length})`
                )}: [ ${this.dim(toolNames)} ]`
            );
          }
        }

        // 3. FLUSSO DI COSCIENZA DEL MODELLO
        if (this.showThoughts && event.output.thought) {
          this.write(
            pfx +
              `  💭 ${this.yellow(
                this.bold("Flusso di coscienza (Ragionamento dell'Agente):")
              )}`
          );
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `     ${this.yellow(l)}`);
          }
        }

        // 4. CHIAMATE E ARGOMENTI DECISI DAL MODELLO
        if (event.output.calls.length > 0) {
          const callCount = event.output.calls.length;
          this.write(
            pfx +
              `  ⚡ ${this.bold(callCount > 1 ? 'Chiamate decise dal modello:' : 'Chiamata decisa dal modello:')} ${this.dim(
                `(${event.durationMs}ms)`
              )}`
          );
          for (const call of event.output.calls) {
            this.write(pfx + `     • ${this.green(formatCall(call.name, call.payload))}`);
          }
        } else {
          this.write(pfx + `  ⚡ ${this.dim('Nessuna chiamata emessa dal modello.')}`);
        }
        break;
      }

      case 'cognitive_action': {
        let detail = '';
        if (event.toolName === 'imposta_dato' && event.args && typeof event.args === 'object') {
          const k = (event.args as Record<string, unknown>).chiave;
          if (k) detail = `: salvato dato '${k}'`;
        } else if (event.toolName === 'aggiorna_missione') {
          detail = `: nuovo scopo impostato`;
        } else if (event.toolName === 'carica_tool' && Array.isArray((event.args as any)?.tool_ids)) {
          detail = `: montati [${((event.args as any).tool_ids as string[]).join(', ')}]`;
        } else if (event.toolName === 'carica_concetto' && Array.isArray((event.args as any)?.concetto_ids)) {
          detail = `: caricate policy [${((event.args as any).concetto_ids as string[]).join(', ')}]`;
        } else if (event.toolName === 'cerca_tool' || event.toolName === 'cerca_concetti') {
          detail = `: ricerca '${(event.args as any)?.query ?? ''}'`;
        }
        this.write(
          pfx + `  ${this.magenta('✓')} ${this.dim('Operazione interna:')} ${this.bold(event.toolName)}${detail}`
        );
        break;
      }

      case 'state_transition': {
        const toName = humanizeFSMState(event.to);
        const reasonText = humanizeTransitionReason(event.reasonCode, event.context);
        const reasonStr = reasonText ? ` ${this.dim(`(${reasonText})`)}` : '';
        this.write(
          pfx +
            `  🔀 ${this.bold('Passaggio a:')} ${this.bold(this.cyan(toName))}${reasonStr}`
        );
        break;
      }

      case 'yield': {
        const callsStr = event.pendingCalls.map((c) => this.bold(c.name)).join(', ');
        this.write(
          pfx +
            `  ⏸️  ${this.yellow(this.bold('In attesa dei servizi esterni:'))} [ ${callsStr} ]`
        );
        break;
      }

      case 'world_action': {
        this.write('');
        this.write(
          pfx +
            `🌍 ${this.green(this.bold('Servizio esterno:'))} ${this.bold(
              this.green(event.toolId)
            )} ${this.dim(`(${event.durationMs}ms)`)}`
        );
        this.write(
          pfx + `   ${this.dim('→ Inviato:')} ${this.cyan(this.formatData(event.args, 5))}`
        );
        if (event.error) {
          this.write(
            pfx + `   ${this.red('❌ Errore:')} ${this.red(this.formatData(event.error, 5))}`
          );
        } else {
          this.write(
            pfx + `   ${this.green('→ Ricevuto:')} ${this.green(this.formatData(event.result, 5))}`
          );
        }
        break;
      }

      case 'schema_error': {
        this.write('');
        this.write(
          pfx +
            `⚠️  ${this.red(this.bold('Parametri non conformi'))} ${this.dim(
              `su '${event.targetToolId}':`
            )} ${this.red(event.errorDetail)}`
        );
        break;
      }

      case 'halt': {
        const title = ` OBIETTIVO COMPLETATO CON SUCCESSO (Esito: '${event.result.type}') `;
        const border = '═'.repeat(Math.max(64, title.length + 4));

        this.write('');
        this.write(pfx + this.green(`╔${border}╗`));
        this.write(pfx + this.green(`║  ${this.bold(title.padEnd(border.length - 2))}║`));
        this.write(pfx + this.green(`╚${border}╝`));

        this.write(pfx + `   📦 ${this.bold('Dati di uscita finali:')}`);
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
