import { DataRecord, DataValue, ToolDefinition, ToolResult, WorldTool } from '../types/index.js';

/**
 * ============================================================================
 * INTERFACCIA DEL REGISTRO DEL MONDO (W)
 * ============================================================================
 * Il catalogo formale delle funzioni fisiche esogene iniettate nell'Orchestratore.
 */
export interface WorldRegistry {
  /**
   * Restituisce la definizione di un tool (per il modello LLM).
   */
  getToolDefinition(toolId: string): ToolDefinition | undefined;

  /**
   * Esegue un tool fisico verso il mondo esterno W.
   * Valida automaticamente lo schema Zod e inoltra i parametri validati al tool.
   * Rispetta il Teorema di Non-Invasività: non riceve lo stato dell'agente.
   */
  executeTool(toolId: string, args: DataRecord): Promise<ToolResult>;

  /**
   * Elenco completo dei tool disponibili nel Mondo W.
   */
  getAllDefinitions(): ToolDefinition[];

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

    getToolDefinition(toolId: string): ToolDefinition | undefined {
      const tool = toolsMap.get(toolId);
      if (!tool) return undefined;
      return {
        id: tool.id,
        description: tool.description,
        parameters: tool.parameters,
        returns: tool.returns
      };
    },

    getAllDefinitions(): ToolDefinition[] {
      return Array.from(toolsMap.values()).map(tool => ({
        id: tool.id,
        description: tool.description,
        parameters: tool.parameters,
        returns: tool.returns
      }));
    },

    async executeTool(toolId: string, rawArgs: DataRecord): Promise<ToolResult> {
      const tool = toolsMap.get(toolId);
      if (!tool) {
        throw new WorldToolError(
          toolId,
          'not_found',
          `Il tool '${toolId}' non esiste nel catalogo del Mondo W.`
        );
      }

      // Validazione automatica Zod dei parametri attesi
      const parseResult = tool.parameters.safeParse(rawArgs);
      if (!parseResult.success) {
        throw new WorldToolError(
          toolId,
          'invalid_parameters',
          `I parametri forniti per il tool '${toolId}' non rispettano lo schema previsto.`,
          parseResult.error.format()
        );
      }

      // Esecuzione protetta con inoltro dei parametri validati e tipizzati
      try {
        return await tool.execute(parseResult.data);
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        throw new WorldToolError(
          toolId,
          'execution_failed',
          `Errore durante l'esecuzione del tool '${toolId}': ${errorObj.message}`,
          errorObj
        );
      }
    }
  };
}


