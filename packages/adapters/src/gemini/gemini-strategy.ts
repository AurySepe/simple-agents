import { z } from 'zod';
import type {
  InferenceTriple,
  InputMediaAsset,
  Message,
  UserMessageContent,
  ToolDefinition
} from '@simple-agents/core';
import { FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';
import type { MediaResolver } from '../common/media-resolver.js';
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

function resolveInlineText(data: string): string {
  if (data.includes('\n') || data.includes('\r')) {
    return data;
  }
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    if (Buffer.from(decoded, 'utf-8').toString('base64') === data.trim()) {
      return decoded;
    }
    return data;
  } catch {
    return data;
  }
}

/**
 * Converte un asset multimediale formale in una Part nativa di Gemini (inlineData o fileData).
 * La risoluzione dei percorsi locali (kind: 'path') è delegata asincronamente al MediaResolver iniettato.
 */
export async function convertMediaAssetToGeminiPart(
  asset: InputMediaAsset,
  resolver: MediaResolver
): Promise<Record<string, unknown>> {
  const source = asset.source;

  if (asset.modality === 'text_file') {
    let textContent: string;
    switch (source.kind) {
      case 'inline':
        textContent = resolveInlineText(source.data);
        break;
      case 'path':
        textContent = await resolver.resolveText(source.filePath);
        break;
      case 'url':
        textContent = `[Content available at URL: ${source.url}]`;
        break;
      case 'reference':
        throw new Error(
          `Gemini adapter does not support partial file references ({ kind: 'reference' }). ` +
          `Provide the complete file URL using { kind: 'url', url: '<full_url>', mimeType: '<mime_type>' }.`
        );
    }
    return {
      text: asset.filename ? `[File: ${asset.filename}]\n${textContent}` : textContent
    };
  }

  if (source.kind === 'reference') {
    throw new Error(
      `Gemini adapter does not support partial file references ({ kind: 'reference' }). ` +
      `Provide the complete file URL using { kind: 'url', url: '<full_url>', mimeType: '<mime_type>' }.`
    );
  }

  if (source.kind === 'url') {
    if (!source.mimeType || source.mimeType.trim().length === 0) {
      throw new Error(
        `Gemini file URL requires an explicit mimeType for asset '${asset.filename ?? source.url}'.`
      );
    }

    const isGoogleFileApi = source.url.startsWith('https://generativelanguage.googleapis.com/');
    const isCloudStorage = source.url.startsWith('gs://');

    if (!isGoogleFileApi && !isCloudStorage) {
      throw new Error(
        `Unsupported Gemini file URL: '${source.url}'. ` +
        `Gemini only supports Google Files API URLs ('https://generativelanguage.googleapis.com/...') or Google Cloud Storage URIs ('gs://...').`
      );
    }

    return {
      fileData: {
        fileUri: source.url,
        mimeType: source.mimeType
      }
    };
  }

  if (source.kind === 'inline') {
    return {
      inlineData: {
        mimeType: source.mimeType,
        data: source.data
      }
    };
  }

  // source.kind === 'path'
  const { base64, mimeType } = await resolver.resolveBinary(source.filePath, source.mimeType);
  return {
    inlineData: {
      mimeType,
      data: base64
    }
  };
}

/**
 * Converte l'ontologia UserMessageContent formale in un array di Part Gemini in modo asincrono e concorrente.
 */
export async function convertUserContentToParts(
  content: UserMessageContent,
  resolver: MediaResolver
): Promise<Array<Record<string, unknown>>> {
  switch (content.kind) {
    case 'text':
      return [{ text: content.text }];

    case 'media':
      return await Promise.all(content.files.map((file) => convertMediaAssetToGeminiPart(file, resolver)));

    case 'text_with_media': {
      const fileParts = await Promise.all(content.files.map((file) => convertMediaAssetToGeminiPart(file, resolver)));
      return [{ text: content.text }, ...fileParts];
    }

    case 'interleaved':
      return await Promise.all(
        content.blocks.map(async (block) => {
          if (block.type === 'text') {
            return { text: block.text };
          }
          return await convertMediaAssetToGeminiPart(block.media, resolver);
        })
      );
  }
}

/**
 * Strategia di formattazione del contesto cognitivo formale (InferenceTriple)
 * per l'SDK Google GenAI (`@google/genai`).
 *
 * Completamente stateless: la gestione di thoughtSignature e della cronologia
 * deriva esclusivamente dai dati memorizzati nella tupla dell'agente (Ep).
 * Richiede un MediaResolver esplicito per risolvere qualsiasi risorsa locale.
 */
export class GeminiStrategy {
  constructor(
    private readonly mediaResolver: MediaResolver,
    private readonly options?: GeminiChatOptions
  ) {
    if (!mediaResolver) {
      throw new Error(
        "GeminiStrategy requires an explicit 'mediaResolver' instance. Provide an instance of NodeFileSystemMediaResolver or InMemoryMediaResolver."
      );
    }
  }

  public async format(context: InferenceTriple): Promise<FormattedGeminiContext> {
    // 1. System Instruction F_Ω
    const systemInstruction = context.systemFrame
      ? { parts: [{ text: context.systemFrame }] }
      : undefined;

    // 2. Cronologia Ep: mapping su contenuti Gemini (user/model) con adiacenza corretta
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<Record<string, unknown>>;
    }> = [];

    const appendContent = (role: 'user' | 'model', newParts: Array<Record<string, unknown>>) => {
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts.push(...newParts);
      } else {
        contents.push({ role, parts: [...newParts] });
      }
    };

    // Traccia quali callId sono nativi Gemini con firma valida
    const nativeCallIds = new Set<string>();
    const callIdToToolName = new Map<string, string>();

    for (const msg of context.messages) {
      switch (msg.type) {
        case 'stimulus': {
          const parts = await convertUserContentToParts(msg.content, this.mediaResolver);
          appendContent('user', parts);
          break;
        }

        case 'thought': {
          appendContent('model', [{ thought: true, text: msg.content }]);
          break;
        }

        case 'action': {
          callIdToToolName.set(msg.callId, msg.content.name);
          const signature =
            msg.providerMetadata?.provider === 'gemini'
              ? msg.providerMetadata.thoughtSignature
              : undefined;

          if (signature) {
            // Chiamata nativa Gemini con firma valida: proiettata come functionCall nativo
            nativeCallIds.add(msg.callId);
            appendContent('model', [
              {
                functionCall: {
                  name: msg.content.name,
                  args: msg.content.payload,
                  id: msg.callId
                },
                thoughtSignature: signature
              }
            ]);
          } else {
            // Chiamata proveniente da un altro provider LLM o ripristinata senza firma:
            // proiettata come messaggio utente naturale in lingua standard inglese
            appendContent('user', [
              {
                text: `[Previously executed action]: ${msg.content.name}(${JSON.stringify(msg.content.payload)})`
              }
            ]);
          }
          break;
        }

        case 'result': {
          const toolName = callIdToToolName.get(msg.callId) ?? 'tool_result';
          if (nativeCallIds.has(msg.callId)) {
            // Risposta a functionCall nativo Gemini
            appendContent('user', [
              {
                functionResponse: {
                  name: toolName,
                  response: {
                    output: msg.content
                  }
                }
              }
            ]);
          } else {
            // Risultato per azione cross-model/senza firma inviato come testo utente in inglese
            appendContent('user', [
              {
                text: `[Observed result for ${toolName}]: ${JSON.stringify(msg.content)}`
              }
            ]);
          }
          break;
        }
      }
    }

    // 3. Tools V_Ω: conversione degli schemi Zod e forzatura tool calling nativo
    let tools: FormattedGeminiContext['tools'] = undefined;
    let toolConfig: FormattedGeminiContext['toolConfig'] = undefined;

    if (context.visibleTools && context.visibleTools.length > 0) {
      const functionDeclarations = context.visibleTools.map((t: ToolDefinition) => ({
        name: t.id,
        description: t.description,
        parameters: cleanZodSchemaForGemini(t.parameters)
      }));

      tools = [{ functionDeclarations }];

      // Nel framework ad automa a stati finiti, l'agente deve sempre deliberare
      // selezionando almeno un tool tra quelli visibili (mode: ANY invariante)
      toolConfig = {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: functionDeclarations.map((f) => f.name)
        }
      };
    }

    // 4. Configurazione Thinking / Reasoning (Gemini 3/4)
    // Nessun default imposto: solo le proprietà esplicitamente configurate vengono incluse
    let thinkingConfig: FormattedGeminiContext['thinkingConfig'] = undefined;
    if (this.options?.thinking) {
      const t = this.options.thinking;
      let level: ThinkingLevel | undefined = undefined;
      if (t.thinkingLevel !== undefined) {
        if (typeof t.thinkingLevel === 'string') {
          level = (ThinkingLevel as Record<string, ThinkingLevel>)[t.thinkingLevel];
        } else {
          level = t.thinkingLevel;
        }
      }

      thinkingConfig = {
        thinkingLevel: level,
        thinkingBudget: t.thinkingBudget,
        includeThoughts: t.includeThoughts
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

