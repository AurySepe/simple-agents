import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentManifest,
  AgentState,
  createDefaultFrameworkConfig,
  createFrameProjector,
  createWorldRegistry,
  defaultMarkdownProjector,
  defaultOperationalPolicy,
  defaultPolicy,
  defaultXmlProjector,
  FrameworkEngine,
  LanguageModelAdapter,
  ToolDefinition
} from '../src/index.js';

describe('Standard Library / Defaults of Level 1 (English Unified)', () => {
  it('should instantiate a FrameworkEngine with createDefaultFrameworkConfig()', () => {
    const framework = new FrameworkEngine(createDefaultFrameworkConfig());
    expect(framework).toBeInstanceOf(FrameworkEngine);
  });

  it('should allow selective override of projector and policy', () => {
    const config = createDefaultFrameworkConfig({
      systemFrameProjector: defaultXmlProjector,
      policy: defaultPolicy
    });

    expect(config.systemFrameProjector).toBe(defaultXmlProjector);
    expect(config.policy).toBe(defaultPolicy);

    const errorMsg = config.policy?.formatSchemaErrorMessage('test_tool', 'Missing field x');
    expect(errorMsg).toContain("Invalid parameters for tool 'test_tool': Missing field x");
  });

  describe('Operational Policy Defaults', () => {
    it('should format schema and syntax errors in English standard', () => {
      const schemaErr = defaultOperationalPolicy.formatSchemaErrorMessage('calculate', 'missing amount');
      expect(schemaErr).toBe("Invalid parameters for tool 'calculate': missing amount");

      const syntaxErr = defaultOperationalPolicy.formatSyntaxErrorMessage('calculate', '{ foo: ', 'Unexpected end of JSON');
      expect(syntaxErr).toBe('Invalid JSON syntax in arguments for tool \'calculate\': Unexpected end of JSON. Received raw text: "{ foo: "');

      const diag = defaultOperationalPolicy.formatDiagnosticPayload('SCHEMA_VALIDATION_ERROR', schemaErr, { foo: 'bar' });
      expect(diag.status).toBe('error');
      expect(diag.code).toBe('SCHEMA_VALIDATION_ERROR');
      expect(diag.message).toBe(schemaErr);
      expect(diag.details).toEqual({ foo: 'bar' });
    });

    it('defaultPolicy should be an alias of defaultOperationalPolicy', () => {
      expect(defaultPolicy).toBe(defaultOperationalPolicy);
    });
  });

  describe('Default Projectors', () => {
    const dummyState: AgentState = {
      I: 'You are an intelligent virtual assistant.',
      Ms: 'Assist the client with order tracking',
      Ds: { orderId: 'ORD-999' },
      Ta: new Set(['calculate_total']),
      Ka: new Map([
        ['concept_1', { name: 'concept_1', descrizione: 'Return Policy', corpo: 'Returns within 30 days' }]
      ]),
      Ep: []
    };

    it('should project state in Markdown with English headers and operating protocol', () => {
      const output = defaultMarkdownProjector.renderFrame(dummyState);
      expect(output).toContain('# IDENTITY');
      expect(output).toContain('## MISSION');
      expect(output).toContain('## OPERATING PROTOCOL');
      expect(output).toContain('## STRUCTURED OPERATIONAL DATA');
      expect(output).toContain('## ACTIVE KNOWLEDGE');
      expect(output).toContain('### [DOCUMENT: concept_1] Return Policy');
      expect(output).toContain('ORD-999');
      expect(output).toContain('Returns within 30 days');
    });

    it('should project state in XML with English semantic tags', () => {
      const output = defaultXmlProjector.renderFrame(dummyState);
      expect(output).toContain('<identity>');
      expect(output).toContain('<mission>');
      expect(output).toContain('<operating_protocol>');
      expect(output).toContain('<structured_data>');
      expect(output).toContain('<active_concepts>');
      expect(output).toContain('<concept name="concept_1" description="Return Policy">');
    });

    it('should support unified creation via createFrameProjector', () => {
      const mdProjector = createFrameProjector({ format: 'markdown' });
      expect(mdProjector.renderFrame(dummyState)).toContain('# IDENTITY');

      const xmlProjector = createFrameProjector({ format: 'xml' });
      expect(xmlProjector.renderFrame(dummyState)).toContain('<identity>');
    });
  });

  describe('End-to-End Execution with Defaults', () => {
    it('should execute a complete agent cycle with default modules and terminate with A_term', async () => {
      const framework = new FrameworkEngine(createDefaultFrameworkConfig());

      const mockTool = {
        id: 'greet',
        description: 'Greets the user',
        parameters: z.object({ name: z.string() }),
        execute: async (args: { name: string }) => `Hello ${args.name}!`
      };

      const mockWorld = createWorldRegistry([mockTool]);
      const runtime = framework.bindWorld(mockWorld);

      const manifest: AgentManifest = {
        I: 'Default Agent',
        Ms0: 'Greet and terminate',
        Ta0: ['greet'],
        A_term: [
          {
            id: 'terminate',
            description: 'Concludes operation',
            schema: z.object({ outcome: z.string() })
          }
        ]
      };

      let stepCount = 0;
      const model: LanguageModelAdapter = {
        infer: async (_ctx) => {
          stepCount++;
          if (stepCount === 1) {
            return {
              thought: 'Need to greet the user',
              calls: [
                {
                  id: 'call_1',
                  name: 'greet',
                  payload: { name: 'Mario' }
                }
              ]
            };
          }
          return {
            thought: 'Greeting completed, terminating',
            calls: [
              {
                id: 'call_term',
                name: 'terminate',
                payload: { outcome: 'Done' }
              }
            ]
          };
        }
      };

      const agent = runtime.spawnAgent(manifest, model);
      const outcome = await agent.run({ userContent: { kind: 'text', text: 'Execute task.' } });

      expect(outcome.status).toBe('halt');
      if (outcome.status !== 'halt') throw new Error('Expected halt');
      expect(outcome.result.type).toBe('terminate');
      expect(outcome.result.payload).toEqual({ outcome: 'Done' });

      const ep = agent.getState().Ep;
      const stimulus = ep.find((e) => e.type === 'stimulus');
      expect(stimulus).toBeDefined();
      expect(stimulus?.content).toEqual({ kind: 'text', text: 'Execute task.' });

      const action = ep.find((e) => e.type === 'action' && e.content.name === 'greet');
      expect(action).toBeDefined();

      const result = ep.find((e) => e.type === 'result' && e.callId === 'call_1');
      expect(result).toBeDefined();
      expect(result?.content).toBe('Hello Mario!');
    });
  });
});
