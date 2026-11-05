import {
  AgentState,
  Directive,
  ExitResult,
  FSMControlState,
  InferenceTriple,
  ModelOutput,
  ToolCall,
  TransitionReasonCode
} from '../types/index.js';

/**
 * ============================================================================
 * EVENTI DI TELEMETRIA E OSSERVABILITÀ DELL'AUTOMA AGENTE
 * ============================================================================
 * Tutti gli eventi sono fortemente tipizzati come discriminated union su 'type'.
 * Includono timestamp e coordinate temporali formali tau = <c, t>.
 */

export interface BaseAgentEvent {
  timestamp: Date;
  macroCycle: number; // c
  tick: number;       // t
}

export interface MacroCycleStartEvent extends BaseAgentEvent {
  type: 'macro_cycle_start';
  userContent?: unknown;
  worldResults?: Array<{ callId: string; result: unknown }>;
}

export interface StepStartEvent extends BaseAgentEvent {
  type: 'step_start';
  controlState: FSMControlState;
  directive: Directive;
  stateSnapshot: Readonly<AgentState>;
}

export interface ModelInferenceEvent extends BaseAgentEvent {
  type: 'model_inference';
  controlState: FSMControlState;
  directive: Directive;
  context: InferenceTriple;
  output: ModelOutput;
  durationMs: number;
  stateSnapshot: Readonly<AgentState>;
}

export interface CognitiveActionEvent extends BaseAgentEvent {
  type: 'cognitive_action';
  toolName: string;
  canonicalId: string;
  args: Record<string, unknown>;
  result: unknown;
  stateSnapshot: Readonly<AgentState>;
}

export interface WorldActionEvent extends BaseAgentEvent {
  type: 'world_action';
  toolId: string;
  args: unknown;
  result?: unknown;
  error?: unknown;
  durationMs: number;
}

export interface StateTransitionEvent extends BaseAgentEvent {
  type: 'state_transition';
  from: FSMControlState;
  to: FSMControlState;
  reasonCode: TransitionReasonCode;
  context?: Record<string, unknown>;
}

export interface SchemaErrorEvent extends BaseAgentEvent {
  type: 'schema_error';
  targetToolId: string;
  errorDetail: string;
  recoveryDirective: Directive;
}

export interface YieldEvent extends BaseAgentEvent {
  type: 'yield';
  pendingCalls: ToolCall[];
}

export interface HaltEvent extends BaseAgentEvent {
  type: 'halt';
  result: ExitResult;
  stateSnapshot: Readonly<AgentState>;
}

export type AgentEvent =
  | MacroCycleStartEvent
  | StepStartEvent
  | ModelInferenceEvent
  | CognitiveActionEvent
  | WorldActionEvent
  | StateTransitionEvent
  | SchemaErrorEvent
  | YieldEvent
  | HaltEvent;

export type AgentEventType = AgentEvent['type'];

