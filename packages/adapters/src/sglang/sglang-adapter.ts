import type { InferenceTriple, ModelOutput, ModelResult } from '@simple-agents/core';
import type { LanguageModelAdapter } from '../index.js';
import { SGLangClient } from './client.js';
import {
  SGLangChatOptions,
  SGLangContextTruncationWarning,
  SGLangMetrics,
  SGLangModelFamilyStrategy
} from './types.js';

export interface SGLangModelAdapterConfig {
  client: SGLangClient;
  strategy: SGLangModelFamilyStrategy;
  model: string;
  options: SGLangChatOptions;
  onMetrics?: (metrics: SGLangMetrics) => void;
  onContextTruncation?: (warning: SGLangContextTruncationWarning) => void;
}

/**
 * Adapter composito che unisce il client HTTP e la strategia specifica del modello
 * per implementare l'interfaccia LanguageModelAdapter del Framework Ω su server SGLang.
 */
export class SGLangModelAdapter implements LanguageModelAdapter {
  readonly client: SGLangClient;
  readonly strategy: SGLangModelFamilyStrategy;
  readonly model: string;
  readonly options: SGLangChatOptions;
  readonly onMetrics?: (metrics: SGLangMetrics) => void;
  readonly onContextTruncation?: (warning: SGLangContextTruncationWarning) => void;

  constructor(config: SGLangModelAdapterConfig) {
    if (!config.model || config.model.trim().length === 0) {
      throw new Error("SGLangModelAdapter requires an explicit 'model' name.");
    }
    if (config.options?.temperature === undefined) {
      throw new Error("SGLangModelAdapter requires an explicit 'options.temperature' provided by user.");
    }

    this.client = config.client;
    this.strategy = config.strategy;
    this.model = config.model;
    this.options = config.options;
    this.onMetrics = config.onMetrics;
    this.onContextTruncation = config.onContextTruncation;
  }

  async infer(context: InferenceTriple): Promise<ModelResult> {
    const { messages, tools, toolChoice, responseFormat } = this.strategy.formatContext(context);

    // Quando responseFormat (grammatica esclusiva) è attivo, omettiamo tools e tool_choice
    // affinché SGLang / llama-server applichino il constrained decoding su response_format.
    const effectiveToolChoice = responseFormat ? undefined : (this.options.tool_choice ?? toolChoice);

    const { response, metrics } = await this.client.chatCompletions(
      {
        model: this.model,
        messages,
        tools: responseFormat ? undefined : tools,
        tool_choice: effectiveToolChoice,
        response_format: responseFormat,
        parallel_tool_calls: this.options.parallel_tool_calls,
        temperature: this.options.temperature,
        max_tokens: this.options.max_tokens,
        top_p: this.options.top_p,
        top_k: this.options.top_k,
        frequency_penalty: this.options.frequency_penalty,
        presence_penalty: this.options.presence_penalty,
        stop: this.options.stop,
        stream: false
      },
      this.options.context_limit
    );

    if (this.onMetrics) {
      this.onMetrics(metrics);
    }

    if (metrics.contextTruncated && this.onContextTruncation && this.options.context_limit !== undefined) {
      this.onContextTruncation({
        promptTokens: metrics.promptTokens,
        contextLimit: this.options.context_limit,
        saturationRatio: metrics.contextSaturationRatio ?? 1
      });
    }

    const result = this.strategy.parseResponse(response);
    result.usage = {
      promptTokens: metrics.promptTokens,
      completionTokens: metrics.completionTokens,
      totalTokens: metrics.totalTokens,
      tokensPerSecond: metrics.tokensPerSecond
    };
    return result;
  }
}

