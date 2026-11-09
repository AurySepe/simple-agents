import type { OpenAI } from 'openai';
import type { DataRecord, InferenceTriple, ModelOutput, ModelResult } from '@formal-agent/core';

/**
 * Estensione fortemente tipizzata del messaggio assistant per supportare
 * il monologo interiore / reasoning nativo esposto da SGLang/Qwen (reasoning_content).
 */
export interface SGLangAssistantMessageParam extends OpenAI.Chat.ChatCompletionAssistantMessageParam {
  reasoning_content?: string | null;
  thinking?: string | null;
}

export type SGLangMessage =
  | OpenAI.Chat.ChatCompletionSystemMessageParam
  | OpenAI.Chat.ChatCompletionUserMessageParam
  | SGLangAssistantMessageParam
  | OpenAI.Chat.ChatCompletionToolMessageParam
  | OpenAI.Chat.ChatCompletionDeveloperMessageParam;

export type SGLangToolDefinition = OpenAI.Chat.ChatCompletionTool;
export type SGLangToolChoice = OpenAI.Chat.ChatCompletionToolChoiceOption;

/**
 * Estensione fortemente tipizzata della risposta di SGLang con i campi epistemici
 * (reasoning_content generato con --reasoning-parser qwen3).
 */
export interface SGLangMessageResponse extends OpenAI.Chat.ChatCompletionMessage {
  reasoning_content?: string | null;
  thinking?: string | null;
}

export interface SGLangChatChoice extends Omit<OpenAI.Chat.ChatCompletion.Choice, 'message'> {
  message: SGLangMessageResponse;
}

export interface SGLangChatResponse extends Omit<OpenAI.Chat.ChatCompletion, 'choices'> {
  choices: SGLangChatChoice[];
}

export interface SGLangChatOptions {
  temperature: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  tool_choice?: SGLangToolChoice;
  context_limit?: number;
}

export interface SGLangMetrics {
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSecond: number;
  contextLimit?: number;
  contextSaturationRatio?: number;
  contextTruncated?: boolean;
}

export interface SGLangContextTruncationWarning {
  promptTokens: number;
  contextLimit: number;
  saturationRatio: number;
}

export type SGLangReasoningFormat = 'native_field' | 'think_tags' | 'none';

export interface SGLangQwenStrategyOptions {
  reasoningFormat?: SGLangReasoningFormat;
  includeHistoricalThinking?: boolean;
  defaultToolChoice?: 'required' | 'auto';
}

export interface SGLangModelFamilyStrategy {
  formatContext(context: InferenceTriple): {
    messages: SGLangMessage[];
    tools?: SGLangToolDefinition[];
    toolChoice?: SGLangToolChoice;
  };

  parseResponse(response: SGLangChatResponse): ModelResult;
}
