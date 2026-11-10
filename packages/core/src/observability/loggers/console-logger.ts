import { AgentEvent } from '../events.js';
import { AgentObserver } from '../observer.js';
import { AgentState, DataRecord, isUserMessageContent, Message, TransitionReasonCode } from '../../types/index.js';

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
 * Translates technical FSM identifiers into human-readable English expressions.
 */
function humanizeFSMState(state: string): string {
  switch (state) {
    case 'q_sleep':
      return 'Waiting for stimulus';
    case 'q_exec':
      return 'Operational deliberation';
    case 'q_repair':
      return 'Schema repair';
    case 'q_yield':
      return 'Awaiting external services';
    case 'q_halt':
      return 'Completed';
    case 'q_stall':
      return 'Deliberation stall';
    default:
      return state;
  }
}

/**
 * Translates symbolic transition codes into concise English descriptions.
 */
function humanizeTransitionReason(
  code: TransitionReasonCode,
  context?: DataRecord
): string {
  const toolId = context?.toolId ? `'${context.toolId}'` : '';
  switch (code) {
    case 'stimulus_received':
      return 'user stimulus received';
    case 'exec_world_yield':
      return 'world tool calls dispatched, awaiting results';
    case 'exec_term_success':
      return toolId ? `terminated via contract ${toolId}` : 'terminated via contract';
    case 'exec_schema_error':
      return toolId ? `schema validation error for: ${toolId}` : 'schema validation error';
    case 'exec_syntax_error':
      return toolId ? `invalid JSON syntax for: ${toolId}` : 'invalid JSON syntax';
    case 'repair_success':
      return 'schema repair succeeded';
    case 'repair_abort':
      return 'invalid call aborted';
    case 'post_yield_exec':
      return 'received external results, resuming deliberation';
    case 'manual_override':
      return 'manual state override';
    case 'exec_deliberation_stall':
      return 'deliberation stall: thinking budget exhausted';
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
    if (data === undefined) return this.dim('no data');
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

  private formatUserContent(content: unknown): string {
    if (typeof content === 'string') {
      return `"${content}"`;
    }
    if (isUserMessageContent(content)) {
      switch (content.kind) {
        case 'text':
          return `"${content.text}"`;
        case 'media': {
          const filesSummary = content.files
            .map((f) => `${f.modality}${f.filename ? ` (${f.filename})` : ''}`)
            .join(', ');
          return `[${content.files.length} attachments: ${filesSummary}]`;
        }
        case 'text_with_media': {
          const filesSummary = content.files
            .map((f) => `${f.modality}${f.filename ? ` (${f.filename})` : ''}`)
            .join(', ');
          return `"${content.text}" [${content.files.length} attachments: ${filesSummary}]`;
        }
        case 'interleaved': {
          const partsSummary = content.blocks
            .map((b) => (b.type === 'text' ? `"${b.text.slice(0, 30)}..."` : `[${b.media.modality}]`))
            .join(' -> ');
          return `[Interleaved stream: ${partsSummary}]`;
        }
      }
    }
    return this.formatData(content, 3);
  }

  public onEvent(event: AgentEvent): void {
    const pfx = this.prefix ? `${this.prefix} ` : '';

    switch (event.type) {
      case 'macro_cycle_start': {
        if (event.userContent !== undefined) {
          this.write(pfx + `👤 ${this.bold('User:')} ${this.cyan(this.formatUserContent(event.userContent))}`);
        }
        break;
      }

      case 'step_start': {
        const stepNum = event.tick + 1;

        this.write('');
        this.write(pfx + this.bold(this.cyan(`▶ [Step ${stepNum}]`)));

        if (this.showState && event.stateSnapshot) {
          const s = event.stateSnapshot;
          const currentSig = this.getStateSignature(s);
          const isInitial = this.lastStateSignature === undefined;
          const hasChanged = !isInitial && currentSig !== this.lastStateSignature;

          if (isInitial || hasChanged || !this.showStateChangesOnly) {
            this.lastStateSignature = currentSig;
            const stateHeader = isInitial
              ? 'Initial State:'
              : 'Updated State:';

            this.write(pfx + `  🧠 ${this.bold(stateHeader)}`);
            this.write(pfx + `     • ${this.bold('Mission:')} ${this.cyan(`"${s.Ms}"`)}`);

            const dsKeys = Object.keys(s.Ds);
            if (dsKeys.length > 0) {
              const compactDs = JSON.stringify(s.Ds);
              this.write(pfx + `     • ${this.bold('Data:')} ${this.cyan(compactDs)}`);
            }

            const taList = Array.from(s.Ta);
            if (taList.length > 0) {
              this.write(pfx + `     • ${this.bold('Tools:')} ${this.cyan(`[ ${taList.join(', ')} ]`)}`);
            }

            if (s.Ka && s.Ka.size > 0) {
              const kaList = Array.from(s.Ka.keys());
              this.write(pfx + `     • ${this.bold('Knowledge:')} ${this.cyan(`[ ${kaList.join(', ')} ]`)}`);
            }
          }
        }
        break;
      }

      case 'model_inference': {
        if (event.output.status === 'stall') {
          if (this.showThoughts && event.output.stall.partialThought) {
            this.write(pfx + `  💭 ${this.yellow(this.bold('Partial thought before stall:'))}`);
            const lines = event.output.stall.partialThought.split('\n');
            for (const l of lines) {
              this.write(pfx + `     ${this.yellow(l)}`);
            }
          }
          this.write(pfx + `  🛑 ${this.red(this.bold('Deliberation stall:'))} ${this.red(event.output.stall.message)}`);
          break;
        }

        if (this.showThoughts && event.output.thought) {
          this.write(pfx + `  💭 ${this.yellow(this.bold('Thought:'))}`);
          const lines = event.output.thought.split('\n');
          for (const l of lines) {
            this.write(pfx + `     ${this.yellow(l)}`);
          }
        }

        if (event.output.calls.length > 0) {
          for (const call of event.output.calls) {
            this.write(pfx + `  ⚡ ${this.green(this.bold('Action:'))} ${this.green(formatCall(call.name, call.payload))}`);
          }
        } else {
          this.write(pfx + `  ⚡ ${this.dim('No action emitted')}`);
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
              `  🔀 ${this.bold('Transition:')} ${this.bold(this.cyan(toName))}${reasonStr}`
          );
        }
        break;
      }

      case 'world_action': {
        const ms = event.durationMs !== undefined ? this.dim(` (${event.durationMs}ms)`) : '';
        if (event.error) {
          this.write(
            pfx +
              `  🌍 ${this.bold(event.toolId)}${ms} ${this.red('→ Error:')} ${this.red(
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
            `  ⚠️  ${this.red(this.bold('Tool Error'))} ${this.dim(
              `'${event.targetToolId}':`
            )} ${this.red(event.errorPayload.message)}`
        );
        break;
      }

      case 'halt': {
        this.write('');
        this.write(pfx + this.bold(this.green(`🎉 [Completed - ${event.result.type}]`)));
        const formattedResult = JSON.stringify(event.result.payload, null, 2);
        for (const line of formattedResult.split('\n')) {
          this.write(pfx + `   ${this.green(line)}`);
        }
        this.write('');
        break;
      }

      case 'stall': {
        this.write('');
        this.write(pfx + this.bold(this.red(`🛑 [Deliberation Stall - ${event.stall.reason}]`)));
        this.write(pfx + `   ${this.red(event.stall.message)}`);
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

export const ConsoleLogger = ConsoleLoggerObserver;
export type ConsoleLogger = ConsoleLoggerObserver;
