import {
  DataRecord,
  DataValue,
  ToolResult,
  WorldTool,
  WorldToolDefinition
} from '../types/index.js';

/**
 * ============================================================================
 * TIPI ED HELPER PER GLI ESITI DEI TOOL HANDLER
 * ============================================================================
 */
export interface UnexpectedToolError {
  type: 'UNEXPECTED_ERROR';
  message: string;
  cause: unknown;
}

export type ToolReturn<TOutput = ToolResult, TCustomError = never> =
  | TOutput
  | { ok: true; data: TOutput; error?: never }
  | { ok: false; error: TCustomError; data?: never };

/**
 * Wraps a successful tool execution payload into a discriminated union result.
 *
 * @example
 * ```typescript
 * return toolOk({ temperatureC: 21, condition: 'Clear' });
 * ```
 */
export function toolOk<T>(data: T): { ok: true; data: T; error?: never } {
  return { ok: true, data };
}

/**
 * Wraps an expected infrastructure or domain error into a typed failure result.
 * The error object must specify a discriminator `type: string`.
 *
 * @example
 * ```typescript
 * return toolFail({
 *   type: 'CONNECTION_TIMEOUT',
 *   retryAfterSeconds: 5,
 * } as const);
 * ```
 */
export function toolFail<E extends { type: string }>(error: E): { ok: false; error: E; data?: never } {
  return { ok: false, error };
}

/**
 * ============================================================================
 * INTERFACCIA DEL REGISTRO DEL MONDO (W)
 * ============================================================================
 * Il catalogo formale delle funzioni fisiche esogene iniettate nell'Orchestratore.
 */
export type ToolExecutionErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'SCHEMA_VALIDATION_ERROR'
  | 'EXECUTION_REJECTED';

export interface ToolExecutionError {
  code: ToolExecutionErrorCode;
  toolId: string;
  message: string;
  customError?: unknown;
  details?: unknown;
  cause?: unknown;
}

export type ToolExecutionResult =
  | { ok: true; data: ToolResult; error?: never }
  | { ok: false; error: ToolExecutionError; data?: never };

export interface WorldRegistry {
  /**
   * Restituisce la definizione di un tool del mondo (per il modello LLM).
   */
  getToolDefinition(toolId: string): WorldToolDefinition | undefined;

  /**
   * Esegue un tool fisico verso il mondo esterno W.
   * Valida automaticamente lo schema Zod e restituisce un ToolExecutionResult tipizzato (ok/error).
   * Rispetta il Teorema di Non-Invasività: non riceve lo stato dell'agente.
   */
  executeTool(toolId: string, args: DataRecord): Promise<ToolExecutionResult>;

  /**
   * Elenco completo dei tool disponibili nel Mondo W.
   */
  getAllDefinitions(): WorldToolDefinition[];

  /**
   * Registra opzionalmente un nuovo tool nel registro.
   */
  register?: (tool: WorldTool) => void;
}

/**
 * Errore strutturato di validazione o esecuzione di un tool del Mondo.
 */
export class WorldToolError extends Error {
  constructor(
    public readonly toolId: string,
    public readonly kind: 'not_found' | 'invalid_parameters' | 'execution_failed',
    message: string,
    public readonly details?: DataValue | Error
  ) {
    super(message);
    this.name = 'WorldToolError';
  }
}

/**
 * ============================================================================
 * FACTORY DEL REGISTRO DEL MONDO
 * ============================================================================
 * Crea un registro del Mondo standard pronto all'uso.
 * Gestisce automaticamente:
 * - Indicizzazione per ID
 * - Validazione Zod automatica dei parametri
 * - Generazione di errori strutturati
 * - Isolamento non-invasivo
 */
export function createWorldRegistry(initialTools: WorldTool[] = []): WorldRegistry {
  const toolsMap = new Map<string, WorldTool>();

  for (const tool of initialTools) {
    toolsMap.set(tool.id, tool);
  }

  return {
    register(tool: WorldTool): void {
      toolsMap.set(tool.id, tool);
    },

    getToolDefinition(toolId: string): WorldToolDefinition | undefined {
      const tool = toolsMap.get(toolId);
      if (!tool) return undefined;
      return {
        kind: 'world',
        id: tool.id,
        description: tool.description,
        parameters: tool.parameters,
        returns: tool.returns
      };
    },

    getAllDefinitions(): WorldToolDefinition[] {
      return Array.from(toolsMap.values()).map(tool => ({
        kind: 'world',
        id: tool.id,
        description: tool.description,
        parameters: tool.parameters,
        returns: tool.returns
      }));
    },

    async executeTool(toolId: string, rawArgs: DataRecord): Promise<ToolExecutionResult> {
      const tool = toolsMap.get(toolId);
      if (!tool) {
        return {
          ok: false,
          error: {
            code: 'TOOL_NOT_FOUND',
            toolId,
            message: `Tool '${toolId}' was not found in World catalog W.`
          }
        };
      }

      // Validazione automatica Zod dei parametri attesi
      const parseResult = tool.parameters.safeParse(rawArgs);
      if (!parseResult.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_VALIDATION_ERROR',
            toolId,
            message: `Parameters provided for tool '${toolId}' do not conform to expected schema.`,
            details: parseResult.error.format()
          }
        };
      }

      // Esecuzione protetta con inoltro dei parametri validati e tipizzati
      try {
        const rawResult = await tool.execute(parseResult.data);
        // Riconoscimento del pattern { ok: false, error } restituito dal tool handler
        if (
          rawResult !== null &&
          typeof rawResult === 'object' &&
          'ok' in rawResult &&
          (rawResult as { ok: boolean }).ok === false &&
          'error' in rawResult
        ) {
          const customError = (rawResult as { error: unknown }).error;
          const message =
            customError && typeof customError === 'object' && 'message' in customError && typeof (customError as { message: unknown }).message === 'string'
              ? (customError as { message: string }).message
              : `Tool '${toolId}' failed with declared environmental error.`;
          return {
            ok: false,
            error: {
              code: 'EXECUTION_REJECTED',
              toolId,
              message,
              customError
            }
          };
        }

        // Riconoscimento del pattern { ok: true, data } restituito dal tool handler (toolOk)
        if (
          rawResult !== null &&
          typeof rawResult === 'object' &&
          'ok' in rawResult &&
          (rawResult as { ok: boolean }).ok === true &&
          'data' in rawResult
        ) {
          return { ok: true, data: (rawResult as { data: ToolResult }).data };
        }

        // Successo di dominio diretto (es. oggetto o valore restituito direttamente)
        return { ok: true, data: rawResult as ToolResult };
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        const unexpectedError: UnexpectedToolError = {
          type: 'UNEXPECTED_ERROR',
          message: errorObj.message,
          cause: errorObj
        };
        return {
          ok: false,
          error: {
            code: 'EXECUTION_REJECTED',
            toolId,
            message: `Unexpected error during execution of tool '${toolId}': ${errorObj.message}`,
            customError: unexpectedError,
            cause: errorObj
          }
        };
      }
    }
  };
}


