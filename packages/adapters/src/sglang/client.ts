import OpenAI from 'openai';
import {
  SGLangChatOptions,
  SGLangChatResponse,
  SGLangMessage,
  SGLangMetrics,
  SGLangToolChoice,
  SGLangToolDefinition
} from './types.js';

export interface SGLangClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface SGLangChatPayload {
  model: string;
  messages: SGLangMessage[];
  tools?: SGLangToolDefinition[];
  tool_choice?: SGLangToolChoice;
  parallel_tool_calls?: boolean;
  temperature: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: false;
}

export interface SGLangChatInvocationOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Livello 1: Client di Trasporto HTTP basato sulla libreria ufficiale 'openai'.
 * Delega completamente la gestione delle chiamate, retry ed errori all'SDK ufficiale.
 */
export class SGLangClient {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly openAIClient: OpenAI;

  constructor(config: SGLangClientConfig) {
    if (!config.baseUrl || config.baseUrl.trim().length === 0) {
      throw new Error("SGLangClient requires an explicit, non-empty 'baseUrl' parameter.");
    }

    let url = config.baseUrl.trim().replace(/\/$/, '');
    if (!url.endsWith('/v1')) {
      url = `${url}/v1`;
    }
    this.baseUrl = url;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;

    this.openAIClient = new OpenAI({
      baseURL: this.baseUrl,
      apiKey: this.apiKey || 'EMPTY',
      ...(typeof this.timeoutMs === 'number' && this.timeoutMs > 0
        ? { timeout: Math.round(this.timeoutMs) }
        : {})
    });
  }

  async chatCompletions(
    request: SGLangChatPayload,
    contextLimit?: number,
    invocationOptions?: SGLangChatInvocationOptions
  ): Promise<{ response: SGLangChatResponse; metrics: SGLangMetrics }> {
    const startWallTime = Date.now();
    const effectiveTimeoutMs = invocationOptions?.timeoutMs ?? this.timeoutMs;

    const requestOptions: OpenAI.RequestOptions = {};
    if (invocationOptions?.signal) {
      requestOptions.signal = invocationOptions.signal;
    }
    if (typeof effectiveTimeoutMs === 'number' && effectiveTimeoutMs > 0) {
      requestOptions.timeout = Math.round(effectiveTimeoutMs);
    }

    let raw: OpenAI.Chat.Completions.ChatCompletion;
    try {
      raw = await this.openAIClient.chat.completions.create(
        {
          model: request.model,
          messages: request.messages,
          ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
          ...(request.tool_choice ? { tool_choice: request.tool_choice } : {}),
          ...(typeof request.parallel_tool_calls === 'boolean'
            ? { parallel_tool_calls: request.parallel_tool_calls }
            : {}),
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          top_p: request.top_p,
          frequency_penalty: request.frequency_penalty,
          presence_penalty: request.presence_penalty,
          stop: request.stop,
          stream: false
        },
        requestOptions
      );
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIConnectionTimeoutError) {
        throw new Error(`SGLang request timed out (${effectiveTimeoutMs}ms): ${err.message}`);
      }
      if (err instanceof OpenAI.APIError) {
        throw new Error(`SGLang HTTP error ${err.status}: ${err.message}`);
      }
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error(`SGLang request timed out (${effectiveTimeoutMs}ms).`);
      }
      throw err;
    }

    const reqDurationMs = Date.now() - startWallTime;
    const promptTokens = raw.usage?.prompt_tokens ?? 0;
    const completionTokens = raw.usage?.completion_tokens ?? 0;
    const totalTokens = raw.usage?.total_tokens ?? promptTokens + completionTokens;

    const tokensPerSecond =
      reqDurationMs > 0 && completionTokens > 0
        ? (completionTokens / reqDurationMs) * 1000
        : 0;

    const hasLimit = typeof contextLimit === 'number' && contextLimit > 0;
    const contextTruncated = hasLimit ? promptTokens >= contextLimit : undefined;
    const contextSaturationRatio = hasLimit ? promptTokens / contextLimit : undefined;

    const metrics: SGLangMetrics = {
      totalDurationMs: reqDurationMs,
      promptTokens,
      completionTokens,
      totalTokens,
      tokensPerSecond,
      contextLimit,
      contextSaturationRatio,
      contextTruncated
    };

    return { response: raw, metrics };
  }
}
