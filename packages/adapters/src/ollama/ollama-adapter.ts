import { InferenceTriple, ModelOutput, ModelResult } from '@formal-agent/core';
import { LanguageModelAdapter } from '../index.js';
import { OllamaClient } from './client.js';
import {
  ContextTruncationWarning,
  ModelFamilyStrategy,
  OllamaChatOptions,
  OllamaMetrics
} from './types.js';

export interface OllamaModelAdapterConfig {
  client: OllamaClient;
  strategy: ModelFamilyStrategy;
  model: string;
  options: OllamaChatOptions;
  keepAlive?: string | number;
  onMetrics?: (metrics: OllamaMetrics) => void;
  onContextTruncation?: (warning: ContextTruncationWarning) => void;
}

/**
 * Adapter composito che unisce il client di trasporto HTTP e la strategia
 * specifica del modello per implementare l'interfaccia LanguageModelAdapter del Framework Ω.
 */
export class OllamaModelAdapter implements LanguageModelAdapter {
  readonly client: OllamaClient;
  readonly strategy: ModelFamilyStrategy;
  readonly model: string;
  readonly options: OllamaChatOptions;
  readonly keepAlive?: string | number;
  readonly onMetrics?: (metrics: OllamaMetrics) => void;
  readonly onContextTruncation?: (warning: ContextTruncationWarning) => void;

  constructor(config: OllamaModelAdapterConfig) {
    if (!config.model || config.model.trim().length === 0) {
      throw new Error("OllamaModelAdapter richiede il nome del modello ('model') esplicito.");
    }
    if (config.options?.temperature === undefined) {
      throw new Error("OllamaModelAdapter richiede 'options.temperature' esplicita fornita dall'utente.");
    }

    this.client = config.client;
    this.strategy = config.strategy;
    this.model = config.model;
    this.options = config.options;
    this.keepAlive = config.keepAlive;
    this.onMetrics = config.onMetrics;
    this.onContextTruncation = config.onContextTruncation;
  }

  async infer(context: InferenceTriple): Promise<ModelResult> {
    const { messages, tools } = this.strategy.formatContext(context);

    const { response, metrics } = await this.client.chat({
      model: this.model,
      messages,
      tools,
      stream: false,
      options: this.options,
      keep_alive: this.keepAlive
    });

    if (this.onMetrics) {
      this.onMetrics(metrics);
    }

    if (metrics.contextTruncated && this.onContextTruncation && this.options.num_ctx !== undefined) {
      this.onContextTruncation({
        promptEvalCount: metrics.promptEvalCount,
        numCtx: this.options.num_ctx,
        saturationRatio: metrics.contextSaturationRatio ?? 1
      });
    }

    return this.strategy.parseResponse(response);
  }
}

