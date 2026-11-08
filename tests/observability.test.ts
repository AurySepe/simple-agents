import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  createConsoleObserver,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  FrameworkEngine,
  InMemoryTelemetryCollector,
  LanguageModelAdapter,
  WorldTool
} from '../src/index.js';

describe('Sistema di Osservabilità, Telemetria e Logging', () => {
  it('dovrebbe raccogliere la traccia completa degli eventi tipizzati tramite InMemoryTelemetryCollector', async () => {
    // 1. Setup Framework e Mondo con un tool
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    const meteoTool: WorldTool = {
      id: 'w_meteo',
      description: 'Restituisce le previsioni meteo per una città',
      parameters: z.object({ citta: z.string() }),
      execute: async ({ citta }) => ({ temperatura: 24, condizione: 'Sereno a ' + citta })
    };
    const world = createWorldRegistry([meteoTool]);
    const runtime = framework.bindWorld(world);

    // 2. Manifesto dell'Agente
    const manifest: AgentManifest = {
      I: 'Agente Meteo Assistente',
      Ms0: 'In attesa',
      Ta0: ['w_meteo'],
      A_term: [
        {
          id: 'risposta_finale',
          description: 'Fornisce la risposta finale al cliente',
          schema: z.object({ esito: z.string() })
        }
      ]
    };

    // 3. Mock del Modello
    let stepCount = 0;
    const model: LanguageModelAdapter = {
      infer: async () => {
        stepCount++;
        if (stepCount === 1) {
          return {
            thought: 'Interrogo il tool meteo.',
            calls: [{ id: 'c1', name: 'w_meteo', payload: { citta: 'Roma' } }]
          };
        }
        if (stepCount === 2) {
          return {
            thought: 'Meteo ricevuto, posso concludere con la risposta finale.',
            calls: [
              {
                id: 'c2',
                name: 'risposta_finale',
                payload: { esito: 'Il meteo a Roma è Sereno con 24 gradi.' }
              }
            ]
          };
        }
        throw new Error(`Passo inatteso: ${stepCount}`);
      }
    };

    // 4. Esecuzione con il raccoglitore di telemetria
    const collector = new InMemoryTelemetryCollector();

    const result = await runtime.runAgent(manifest, model, {
      userContent: 'Che tempo fa a Roma?',
      observers: [collector]
    });

    expect(result.result.type).toBe('risposta_finale');

    // 5. Verifiche di Telemetria
    const events = collector.getEvents();
    expect(events.length).toBeGreaterThan(0);

    // Verifica presenza di tutti i tipi chiave di eventi
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('macro_cycle_start');
    expect(eventTypes).toContain('step_start');
    expect(eventTypes).toContain('model_inference');
    expect(eventTypes).toContain('world_action');
    expect(eventTypes).toContain('state_transition');
    expect(eventTypes).toContain('yield');
    expect(eventTypes).toContain('halt');

    // Verifica estrazione dei pensieri dell'agente (Thought Trace)
    const thoughts = collector.getThoughts();
    expect(thoughts).toHaveLength(2);
    expect(thoughts[0].thought).toBe('Interrogo il tool meteo.');
    expect(thoughts[1].thought).toBe('Meteo ricevuto, posso concludere con la risposta finale.');

    // Verifica azioni sul Mondo
    const worldActions = collector.getWorldActions();
    expect(worldActions).toHaveLength(1);
    expect(worldActions[0].toolId).toBe('w_meteo');
    expect(worldActions[0].args).toEqual({ citta: 'Roma' });
    expect(worldActions[0].result).toEqual({ temperatura: 24, condizione: 'Sereno a Roma' });
    expect(worldActions[0].durationMs).toBeGreaterThanOrEqual(0);

    // Verifica serializzazione JSON
    const json = collector.toJSON();
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toBeInstanceOf(Array);
  });

  it('dovrebbe formattare e stampare i log tramite ConsoleLoggerObserver con writer personalizzato', async () => {
    const logs: string[] = [];
    const logger = createConsoleObserver({
      prefix: '[TEST-LOGGER]',
      writer: (msg) => logs.push(msg)
    });

    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    const world = createWorldRegistry();
    const runtime = framework.bindWorld(world);

    const manifest: AgentManifest = {
      I: 'Agente Logger Test',
      Ms0: 'Test',
      A_term: [
        {
          id: 'termina',
          description: 'Termina',
          schema: z.object({ ok: z.boolean() })
        }
      ]
    };

    const model: LanguageModelAdapter = {
      infer: async () => ({
        thought: 'Penso e termino subito.',
        calls: [{ id: 'c1', name: 'termina', payload: { ok: true } }]
      })
    };

    await runtime.runAgent(manifest, model, {
      userContent: 'Esegui test',
      observers: [logger]
    });

    expect(logs.length).toBeGreaterThan(0);
    const joinedLogs = logs.join('\n');

    expect(joinedLogs).toContain('[TEST-LOGGER]');
    expect(joinedLogs).toContain('Pensiero:');
    expect(joinedLogs).toContain('Penso e termino subito.');
    expect(joinedLogs).toContain('Completato - termina');
  });

  it('dovrebbe consentire la registrazione di un observer a livello di BoundRuntime per tutti gli agenti', async () => {
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    const world = createWorldRegistry();
    const runtime = framework.bindWorld(world);

    const collector = new InMemoryTelemetryCollector();
    // Registrazione a livello di Runtime (globale per tutte le sessioni)
    runtime.addObserver(collector);

    const manifest: AgentManifest = {
      I: 'Agente Runtime Global',
      Ms0: 'Test',
      A_term: [
        {
          id: 'ok',
          description: 'Ok',
          schema: z.object({})
        }
      ]
    };

    const model: LanguageModelAdapter = {
      infer: async () => ({
        calls: [{ id: '1', name: 'ok', payload: {} }]
      })
    };

    await runtime.runAgent(manifest, model, { userContent: 'Go' });

    expect(collector.getEvents().length).toBeGreaterThan(0);
    expect(collector.filterByType('halt')).toHaveLength(1);
  });
});
