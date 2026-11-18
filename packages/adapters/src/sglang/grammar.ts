import { z } from 'zod';
import type { ToolDefinition } from '@simple-agents/core';

export interface ExclusiveActionJsonSchema {
  readonly name: string;
  readonly strict: true;
  readonly schema: Record<string, unknown>;
}

/**
 * Builds a strict `oneOf` JSON Schema for constrained decoding (SGLang XGrammar / llama-server).
 * Enforces mutual exclusion at token-generation time:
 * - Either **exactly 1** termination call (`kind: 'termination'`),
 * - Or **1 or more** normal/control tool calls (`kind: 'tools'`).
 *
 * This makes it impossible for the model to emit a termination action together with a normal tool call.
 */
export function buildExclusiveActionSchema(
  visibleTools: readonly ToolDefinition[]
): ExclusiveActionJsonSchema | undefined {
  if (visibleTools.length === 0) {
    return undefined;
  }

  const terminationTools = visibleTools.filter((t) => t.kind === 'termination');
  const actionTools = visibleTools.filter((t) => t.kind === 'world' || t.kind === 'control');

  const toCallSchema = (tool: ToolDefinition): Record<string, unknown> => ({
    type: 'object',
    additionalProperties: false,
    required: ['name', 'arguments'],
    properties: {
      name: { const: tool.id },
      arguments: z.toJSONSchema(tool.parameters)
    }
  });

  const branches: Record<string, unknown>[] = [];

  if (terminationTools.length > 0) {
    branches.push({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'calls'],
      properties: {
        kind: { const: 'termination' },
        calls: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items:
            terminationTools.length === 1
              ? toCallSchema(terminationTools[0])
              : { oneOf: terminationTools.map(toCallSchema) }
        }
      }
    });
  }

  if (actionTools.length > 0) {
    branches.push({
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'calls'],
      properties: {
        kind: { const: 'tools' },
        calls: {
          type: 'array',
          minItems: 1,
          items:
            actionTools.length === 1
              ? toCallSchema(actionTools[0])
              : { oneOf: actionTools.map(toCallSchema) }
        }
      }
    });
  }

  if (branches.length === 0) {
    return undefined;
  }

  return {
    name: 'exclusive_agent_action',
    strict: true,
    schema: branches.length === 1 ? branches[0] : { oneOf: branches }
  };
}
