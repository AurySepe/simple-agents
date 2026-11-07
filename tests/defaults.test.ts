import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  AgentState,
  createDefaultFrameworkConfig,
  createWorldRegistry,
  defaultEnglishPolicy,
  defaultItalianPolicy,
  defaultMarkdownProjector,
  defaultXmlProjector,
  FrameworkEngine,
  LanguageModelAdapter,
  ToolDefinition
} from '../src/index.js';

describe('Standard Library / Defaults di Livello 1', () => {
  it('dovrebbe istanziare un FrameworkEngine con createDefaultFrameworkConfig()', () => {
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    expect(framework).toBeInstanceOf(FrameworkEngine);
  });

  it('dovrebbe consentire l override selettivo del proiettore e della policy linguistica con messaggi in inglese', () => {
    const config = createDefaultFrameworkConfig({
      systemFrameProjector: defaultXmlProjector,
      policy: defaultEnglishPolicy
    });

    expect(config.systemFrameProjector).toBe(defaultXmlProjector);
    expect(config.policy).toBe(defaultEnglishPolicy);

    const errorMsg = config.policy?.formatSchemaErrorMessage('test_tool', 'Missing field x');
    expect(errorMsg).toContain("Invalid parameters for tool 'test_tool': Missing field x");
  });

  describe('Policy di Default (Italiana ed Inglese)', () => {
    it('dovrebbe formattare gli errori di schema e sintassi in italiano', () => {
      const schemaErr = defaultItalianPolicy.formatSchemaErrorMessage('calcola', 'importo mancante');
      expect(schemaErr).toBe("Parametri non conformi allo schema per il tool 'calcola': importo mancante");

      const syntaxErr = defaultItalianPolicy.formatSyntaxErrorMessage('calcola', '{ foo: ', 'Unexpected end of JSON');
      expect(syntaxErr).toBe('Sintassi JSON non valida negli argomenti per il tool \'calcola\': Unexpected end of JSON. Testo ricevuto: "{ foo: "');

      const diag = defaultItalianPolicy.formatDiagnosticPayload('SCHEMA_VALIDATION_ERROR', schemaErr, { foo: 'bar' });
      expect(diag.status).toBe('error');
      expect(diag.code).toBe('SCHEMA_VALIDATION_ERROR');
      expect(diag.message).toBe(schemaErr);
      expect(diag.details).toEqual({ foo: 'bar' });
    });

    it('dovrebbe formattare gli errori di schema e sintassi in inglese', () => {
      const schemaErr = defaultEnglishPolicy.formatSchemaErrorMessage('calculate', 'missing amount');
      expect(schemaErr).toBe("Invalid parameters for tool 'calculate': missing amount");

      const syntaxErr = defaultEnglishPolicy.formatSyntaxErrorMessage('calculate', '{ foo: ', 'Unexpected end of JSON');
      expect(syntaxErr).toBe('Invalid JSON syntax in arguments for tool \'calculate\': Unexpected end of JSON. Received raw text: "{ foo: "');

      const diag = defaultEnglishPolicy.formatDiagnosticPayload('SYNTAX_ERROR', syntaxErr);
      expect(diag.status).toBe('error');
      expect(diag.code).toBe('SYNTAX_ERROR');
      expect(diag.message).toBe(syntaxErr);
    });
  });

  describe('Proiettori di Default', () => {
    const dummyState: AgentState = {
      I: 'Sei un assistente virtuale.',
      Ms: 'Assistere il cliente',
      Ds: { orderId: 'ORD-999' },
      Ta: new Set(['calcola_totale']),
      Ka: new Map([
        ['concetto_1', { id: 'concetto_1', descrizione: 'Politica resi', corpo: 'Resi entro 30gg' }]
      ]),
      Ep: []
    };

    it('dovrebbe proiettare lo stato in Markdown', () => {
      const output = defaultMarkdownProjector.renderFrame(dummyState);
      expect(output).toContain('# IDENTITY');
      expect(output).toContain('## MISSION');
      expect(output).toContain('ORD-999');
      expect(output).toContain('Politica resi');
    });

    it('dovrebbe proiettare lo stato in XML', () => {
      const output = defaultXmlProjector.renderFrame(dummyState);
      expect(output).toContain('<identity>');
      expect(output).toContain('<mission>');
      expect(output).toContain('<structured_data>');
      expect(output).toContain('<active_concepts>');
    });
  });

  describe('End-to-End con i Default', () => {
    it('dovrebbe eseguire un ciclo completo agente con i moduli di default e terminare con A_term', async () => {
      const framework = new FrameworkEngine(createDefaultFrameworkConfig());

      const mockTool = {
        id: 'saluta',
        description: 'Saluta l utente',
        parameters: z.object({ nome: z.string() }),
        execute: async (args: { nome: string }) => `Ciao ${args.nome}!`
      };

      const mockWorld = createWorldRegistry([mockTool]);

      const runtime = framework.bindWorld(mockWorld);

      const manifest: AgentManifest = {
        I: 'Agente Default',
        Ms0: 'Saluta e termina',
        Ta0: ['saluta'],
        A_term: [
          {
            id: 'termina',
            description: 'Conclude operatività',
            schema: z.object({ esito: z.string() })
          }
        ]
      };

      let stepCount = 0;
      const model: LanguageModelAdapter = {
        infer: async (_ctx) => {
          stepCount++;
          if (stepCount === 1) {
            // Primo step: chiama il tool operativo del mondo
            return {
              thought: 'Devo salutare l utente',
              calls: [
                {
                  id: 'call_1',
                  name: 'saluta',
                  payload: { nome: 'Mario' }
                }
              ]
            };
          }
          // Secondo step: vede il risultato nel canale result ed esce tramite A_term
          return {
            thought: 'Saluto completato, ora termino',
            calls: [
              {
                id: 'call_term',
                name: 'termina',
                payload: { esito: 'Perfetto' }
              }
            ]
          };
        }
      };

      const agent = runtime.spawnAgent(manifest, model);
      const outcome = await agent.run({ userContent: 'Esegui il task.' });

      expect(outcome.result.type).toBe('termina');
      expect(outcome.result.payload).toEqual({ esito: 'Perfetto' });

      // Verifica eventi generati in Ep (4-tupla)
      const ep = agent.getState().Ep;
      const stimulus = ep.find((e) => e.type === 'stimulus');
      expect(stimulus).toBeDefined();
      expect(stimulus?.content).toBe('Esegui il task.');

      const thought = ep.find((e) => e.type === 'thought');
      expect(thought).toBeDefined();

      const action = ep.find((e) => e.type === 'action' && e.content.name === 'saluta');
      expect(action).toBeDefined();

      const result = ep.find((e) => e.type === 'result' && e.callId === 'call_1');
      expect(result).toBeDefined();
      expect(result?.content).toBe('Ciao Mario!');
    });
  });
});
