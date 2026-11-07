import {
  AgentState,
  DataRecord,
  DiagnosticErrorPayload,
  ExitResult,
  FSMControlState,
  InferenceTriple,
  ModelOutput,
  ToolCall,
  ToolResult,
  TransitionReasonCode,
  UserPayload
} from '../types/index.js';

export interface BaseAgentEvent {
  timestamp: Date;
  macroCycle: number; // c
  tick: number;       // t
}

export interface MacroCycleStartEvent extends BaseAgentEvent {
  type: 'macro_cycle_start';
  userContent?: UserPayload;
  worldResults?: Array<{ callId: string; result: ToolResult }>;
}

export interface StepStartEvent extends BaseAgentEvent {
  type: 'step_start';
  controlState: FSMControlState;
  stateSnapshot: Readonly<AgentState>;
}

export interface ModelInferenceEvent extends BaseAgentEvent {
  type: 'model_inference';
  controlState: FSMControlState;
  context: InferenceTriple;
  output: ModelOutput;
  durationMs: number;
  stateSnapshot: Readonly<AgentState>;
}

export interface WorldActionEvent extends BaseAgentEvent {
  type: 'world_action';
  toolId: string;
  args: DataRecord;
  result?: ToolResult;
  error?: unknown;
  durationMs: number;
}

export interface StateTransitionEvent extends BaseAgentEvent {
  type: 'state_transition';
  from: FSMControlState;
  to: FSMControlState;
  reasonCode: TransitionReasonCode;
  context?: DataRecord;
}

export interface ToolErrorEvent extends BaseAgentEvent {
  type: 'tool_error';
  targetToolId: string;
  callId?: string;
  errorPayload: DiagnosticErrorPayload;
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
  | WorldActionEvent
  | StateTransitionEvent
  | ToolErrorEvent
  | YieldEvent
  | HaltEvent;
