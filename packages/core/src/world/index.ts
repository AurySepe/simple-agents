import {
  DataRecord,
  DataValue,
  ToolResult,
  WorldTool,
  WorldToolDefinition
} from '../types/index.js';

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
        const data = await tool.execute(parseResult.data);
        return { ok: true, data };
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        return {
          ok: false,
          error: {
            code: 'EXECUTION_REJECTED',
            toolId,
            message: `Error during execution of tool '${toolId}': ${errorObj.message}`,
            cause: errorObj
          }
        };
      }
    }
  };
}


