import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createWorldRegistry, WorldTool, WorldToolError } from '../src/index.js';

describe('World Registry (Livello 2): Validazione automatica ed esecuzione non-invasiva', () => {
  it('dovrebbe catalogare i tool, validare i parametri con Zod ed eseguire con parametri tipizzati', async () => {
    let executedWith: any = null;

    const meteoTool: WorldTool = {
      id: 'w_meteo',
      description: 'Restituisce il meteo di una città specificata',
      parameters: z.object({
        citta: z.string().min(2),
        unita: z.enum(['C', 'F']).default('C')
      }),
      execute: async (args) => {
        executedWith = args;
        return { temperatura: 22, unita: args.unita, condizione: 'Soleggiato' };
      }
    };

    const world = createWorldRegistry([meteoTool]);

    // 1. Verifica definizioni per LLM
    expect(world.getAllDefinitions()).toHaveLength(1);
    expect(world.getToolDefinition('w_meteo')?.id).toBe('w_meteo');
    expect(world.getToolDefinition('non_esiste')).toBeUndefined();

    // 2. Esecuzione valida
    const result = await world.executeTool('w_meteo', { citta: 'Roma', unita: 'C' });
    expect(result).toEqual({ temperatura: 22, unita: 'C', condizione: 'Soleggiato' });
    expect(executedWith).toEqual({ citta: 'Roma', unita: 'C' });

    // 3. Esecuzione con parametri non validi (Zod safeParse fallisce)
    await expect(
      world.executeTool('w_meteo', { citta: 'R', unita: 'Kelvin' })
    ).rejects.toThrow(WorldToolError);

    try {
      await world.executeTool('w_meteo', { citta: 'R', unita: 'Kelvin' });
    } catch (err) {
      expect(err).toBeInstanceOf(WorldToolError);
      const toolErr = err as WorldToolError;
      expect(toolErr.kind).toBe('invalid_parameters');
      expect(toolErr.toolId).toBe('w_meteo');
      expect(toolErr.details).toBeDefined();
    }

    // 4. Esecuzione di tool sconosciuto
    await expect(
      world.executeTool('w_sconosciuto', {})
    ).rejects.toThrow(WorldToolError);
  });

  it('dovrebbe consentire la registrazione dinamica di nuovi tool con register()', async () => {
    const world = createWorldRegistry();
    expect(world.getAllDefinitions()).toHaveLength(0);

    world.register!({
      id: 'w_calcolatrice',
      description: 'Esegue una somma',
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b
    });

    expect(world.getAllDefinitions()).toHaveLength(1);
    const sum = await world.executeTool('w_calcolatrice', { a: 10, b: 20 });
    expect(sum).toBe(30);
  });
});

