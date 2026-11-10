import { z } from 'zod';
import type {
  InferenceTriple,
  InputMediaAsset,
  Message,
  UserMessageContent,
  ToolDefinition
} from '@formal-agent/core';
import { FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';
import { resolveMediaBase64, resolveTextFileContent } from '../common/media-resolver.js';
import type { GeminiChatOptions } from './types.js';

export interface FormattedGeminiContext {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<Record<string, unknown>>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig?: {
      mode: FunctionCallingConfigMode;
      allowedFunctionNames?: string[];
    };
  };
  thinkingConfig?: {
    thinkingLevel?: ThinkingLevel;
    thinkingBudget?: number;
    includeThoughts?: boolean;
  };
}

/**
 * Pulisce lo schema JSON prodotto da z.toJSONSchema() eliminando metadata
 * non supportati dal parser OpenAPI/JSONSchema di Gemini (come $schema).
 */
export function cleanZodSchemaForGemini(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema, ...clean } = jsonSchema;
  return clean;
}

/**
 * Converte un asset multimediale formale in una Part nativa di Gemini (inlineData).
 */
export function convertMediaAssetToGeminiPart(asset: InputMediaAsset): Record<string, unknown> {
  if (asset.modality === 'text_file') {
    const textContent = resolveTextFileContent(asset);
    return {
      text: asset.filename ? `[File: ${asset.filename}]\n${textContent}` : textContent
    };
  }

  const { base64, mimeType } = resolveMediaBase64(asset);
  return {
    inlineData: {
      mimeType,
      data: base64
    }
  };
}

/**
 * Converte l'ontologia UserMessageContent formale in un array di Part Gemini.
 */
export function convertUserContentToParts(content: UserMessageContent): Array<Record<string, unknown>> {
  switch (content.kind) {
    case 'text':
      return [{ text: content.text }];

    case 'media':
      return content.files.map(convertMediaAssetToGeminiPart);

    case 'text_with_media':
      return [
        { text: content.text },
        ...content.files.map(convertMediaAssetToGeminiPart)
      ];

    case 'interleaved':
      return content.blocks.map((block) => {
        if (block.type === 'text') {
          return { text: block.text };
        }
        return convertMediaAssetToGeminiPart(block.media);
      });
  }
}

/**
 * Strategia di formattazione del contesto cognitivo formale (InferenceTriple)
 * per l'SDK Google GenAI (`@google/genai`).
 */
export class GeminiStrategy {
  constructor(private readonly options?: GeminiChatOptions) {}

  public format(context: InferenceTriple): FormattedGeminiContext {
    // 1. System Instruction F_Ω
    const systemInstruction = context.systemFrame
      ? { parts: [{ text: context.systemFrame }] }
      : undefined;

    // 2. Cronologia Ep: mapping su contenuti Gemini (user/model)
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<Record<string, unknown>>;
    }> = [];

    // Mappa callId -> toolName per ricreare le functionResponse
    const callIdToToolName = new Map<string, string>();

    for (const msg of context.messages) {
      switch (msg.type) {
        case 'stimulus': {
          const parts = convertUserContentToParts(msg.content);
          contents.push({ role: 'user', parts });
          break;
        }

        case 'thought': {
          // I pensieri dell'agente possono essere inseriti come parte model
          // se non precedono immediatamente una action (in quel caso verranno raggruppati)
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
          break;
        }

        case 'action': {
          callIdToToolName.set(msg.callId, msg.content.name);
          contents.push({
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: msg.content.name,
                  args: msg.content.payload
                }
              }
            ]
          });
          break;
        }

        case 'result': {
          const toolName = callIdToToolName.get(msg.callId) ?? 'tool_result';
          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: toolName,
                  response: {
                    output: msg.content
                  }
                }
              }
            ]
          });
          break;
        }
      }
    }

    // 3. Tools V_Ω: conversione degli schemi Zod
    let tools: FormattedGeminiContext['tools'] = undefined;
    let toolConfig: FormattedGeminiContext['toolConfig'] = undefined;

    if (context.visibleTools && context.visibleTools.length > 0) {
      const functionDeclarations = context.visibleTools.map((t: ToolDefinition) => ({
        name: t.id,
        description: t.description,
        parameters: cleanZodSchemaForGemini(t.parameters)
      }));

      tools = [{ functionDeclarations }];

      // Modalità di function calling
      const choice = this.options?.toolChoice ?? 'required';
      let mode: FunctionCallingConfigMode = FunctionCallingConfigMode.ANY;

      if (choice === 'auto' || choice === FunctionCallingConfigMode.AUTO) {
        mode = FunctionCallingConfigMode.AUTO;
      } else if (choice === 'none' || choice === FunctionCallingConfigMode.NONE) {
        mode = FunctionCallingConfigMode.NONE;
      } else {
        mode = FunctionCallingConfigMode.ANY;
      }

      toolConfig = {
        functionCallingConfig: {
          mode,
          allowedFunctionNames: functionDeclarations.map((f) => f.name)
        }
      };
    }

    // 4. Configurazione Thinking / Reasoning (Gemini 3/4)
    let thinkingConfig: FormattedGeminiContext['thinkingConfig'] = undefined;
    if (this.options?.thinking) {
      const t = this.options.thinking;
      let level: ThinkingLevel | undefined = undefined;
      if (t.thinkingLevel) {
        if (typeof t.thinkingLevel === 'string') {
          level = (ThinkingLevel as Record<string, ThinkingLevel>)[t.thinkingLevel] ?? ThinkingLevel.MEDIUM;
        } else {
          level = t.thinkingLevel;
        }
      }

      thinkingConfig = {
        thinkingLevel: level,
        thinkingBudget: t.thinkingBudget,
        includeThoughts: t.includeThoughts ?? true
      };
    }

    return {
      contents,
      systemInstruction,
      tools,
      toolConfig,
      thinkingConfig
    };
  }
}
