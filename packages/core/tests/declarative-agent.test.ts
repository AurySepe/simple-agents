import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createDefaultFrameworkConfig,
  defineAgent,
  FrameworkEngine,
  InferenceTriple,
  isDataRecord,
  LanguageModelAdapter,
  ModelResult
} from '../src/index.js';

describe('API Dichiarativa e Type-Safe: defineAgent e Binding', () => {
  // ==========================================================================
  // 1. CONTRATTO DELL'AGENTE (Specifica Cognitiva Pura, zero I/O)
  // ==========================================================================
  const assistenteOrdini = defineAgent({
    identity: 'Assistente Ordini e Clienti',
    mission: 'Assistere i clienti nel recupero e verifica dei propri ordini aziendali.',
    knowledge: [
      {
        name: 'policy_ordini_simultanei',
        descrizione: 'Politica ordini simultanei',
        corpo: 'Le politiche aziendali consentono fino a 3 ordini simultanei.'
      }
    ],
    stateSchema: z.object({
      sessione_id: z.string(),
      tentativi: z.number().default(0)
    }),
    tools: {
      cerca_cliente: {
        description: 'Recupera il profilo del cliente a partire dal suo identificativo numerico.',
        parameters: z.object({
          cliente_id: z.number().int().positive()
        }),
        returns: z.object({
          nome: z.string(),
          categoria: z.enum(['STANDARD', 'VIP'])
        })
      },
      verifica_ordine: {
        description: 'Verifica lo stato di un ordine specifico.',
        parameters: z.object({
          ordine_id: z.string()
        }),
        returns: z.object({
          stato: z.enum(['IN_ATTESA', 'SPEDITO', 'CONSEGNATO']),
          totale: z.number()
        })
      }
    },
    terminations: {
      conferma_informazione: {
        description: 'Termina la conversazione fornendo le informazioni verificate al cliente.',
        schema: z.object({
          messaggio: z.string(),
          dati: z.record(z.string(), z.unknown())
        })
      },
      segnala_impossibilita: {
        description: 'Segnala che non è stato possibile reperire le informazioni richieste.',
        schema: z.object({
          motivo: z.string()
        })
      }
    }
  });

  it('deve creare un contratto puramente dichiarativo con le firme corrette', () => {
    expect(assistenteOrdini.contract.identity).toBe('Assistente Ordini e Clienti');
    expect(assistenteOrdini.contract.tools.cerca_cliente.description).toContain('Recupera il profilo');
    expect(assistenteOrdini.contract.tools.verifica_ordine.parameters).toBeDefined();
    expect(assistenteOrdini.contract.terminations.conferma_informazione).toBeDefined();
    expect(assistenteOrdini.contract.terminations.segnala_impossibilita).toBeDefined();
  });

  it('deve preservare i nomi esatti dei tool senza prefissi forzati', () => {
    const agent = assistenteOrdini.implement({
      initialState: { sessione_id: 'SESS-001', tentativi: 0 },
      tools: {
        cerca_cliente: async ({ cliente_id }) => {
          return { nome: 'Mario Rossi', categoria: 'VIP' };
        },
        verifica_ordine: async ({ ordine_id }) => {
          return { stato: 'SPEDITO', totale: 149.99 };
        }
      }
    });

    const toolDefs = agent.world.getAllDefinitions();
    const toolIds = toolDefs.map(t => t.id);

    expect(toolIds).toContain('cerca_cliente');
    expect(toolIds).toContain('verifica_ordine');
    expect(agent.manifest.Ta0).toEqual(['cerca_cliente', 'verifica_ordine']);
  });

  it('deve consentire il binding multiplo (Mock vs Live) a partire dallo stesso contratto', async () => {
    // 1. Binding MOCK (per test)
    const mockAgent = assistenteOrdini.implement({
      initialState: { sessione_id: 'TEST-MOCK', tentativi: 0 },
      tools: {
        cerca_cliente: async () => ({ nome: 'Mock User', categoria: 'STANDARD' }),
        verifica_ordine: async () => ({ stato: 'IN_ATTESA', totale: 50.0 })
      }
    });

    // 2. Binding LIVE (produzione)
    const liveAgent = assistenteOrdini.implement({
      initialState: { sessione_id: 'LIVE-PROD', tentativi: 0 },
      tools: {
        cerca_cliente: async ({ cliente_id }) => ({ nome: `Utente ${cliente_id}`, categoria: 'VIP' }),
        verifica_ordine: async ({ ordine_id }) => ({ stato: 'CONSEGNATO', totale: 300.0 })
      }
    });

    const resMock = await mockAgent.world.executeTool('cerca_cliente', { cliente_id: 1 });
    const resLive = await liveAgent.world.executeTool('cerca_cliente', { cliente_id: 1 });

    expect(resMock).toEqual({ nome: 'Mock User', categoria: 'STANDARD' });
    expect(resLive).toEqual({ nome: 'Utente 1', categoria: 'VIP' });
  });

  it('deve eseguire con successo il flusso end-to-end con run()', async () => {
    const engine = new FrameworkEngine(createDefaultFrameworkConfig());

    // Mock adapter del modello linguistico che simula:
    // Passo 1: Chiama il tool 'cerca_cliente'
    // Passo 2: Chiama il contratto terminale 'conferma_informazione'
    let step = 0;
    const mockModel: LanguageModelAdapter = {
      async infer(context: InferenceTriple): Promise<ModelResult> {
        step++;
        if (step === 1) {
          return {
            status: 'success',
            thought: 'Cerco le informazioni del cliente 42.',
            calls: [
              {
                id: 'call_1',
                name: 'cerca_cliente',
                payload: { cliente_id: 42 }
              }
            ]
          };
        } else {
          return {
            status: 'success',
            thought: 'Ho recuperato le informazioni. Termino fornendo il responso.',
            calls: [
              {
                id: 'call_2',
                name: 'conferma_informazione',
                payload: {
                  messaggio: 'Cliente VIP verificato con successo.',
                  dati: { nome: 'Luigi Verdi', categoria: 'VIP' }
                }
              }
            ]
          };
        }
      }
    };

    const agent = assistenteOrdini.implement({
      initialState: { sessione_id: 'RUN-TEST-01', tentativi: 1 },
      tools: {
        cerca_cliente: async ({ cliente_id }) => {
          expect(cliente_id).toBe(42);
          return { nome: 'Luigi Verdi', categoria: 'VIP' };
        },
        verifica_ordine: async ({ ordine_id }) => {
          return { stato: 'CONSEGNATO', totale: 100 };
        }
      }
    });

    const outcome = await agent.run(engine, mockModel, {
      userContent: 'Verifica lo stato del cliente 42.'
    });

    expect(outcome.status).toBe('halt');
    if (outcome.status === 'halt') {
      expect(outcome.result.type).toBe('conferma_informazione');
      if (outcome.result.type === 'conferma_informazione') {
        // Tipizzazione discriminata automatica a tempo di compilazione!
        expect(outcome.result.payload.messaggio).toBe('Cliente VIP verificato con successo.');
        expect(outcome.result.payload.dati).toEqual({ nome: 'Luigi Verdi', categoria: 'VIP' });
      }
    }
  });

  // ==========================================================================
  // 5. TEST FAIL-FAST: Nessun fallback arbitrario, errori immediati
  // ==========================================================================
  it('rifiuta la costruzione se identity è vuota o omessa', () => {
    const badAgent = defineAgent({
      identity: '   ',
      mission: 'Test',
      tools: {},
      terminations: {
        fine: { description: 'Fine', schema: z.object({}) }
      }
    });

    expect(() => badAgent.implement({ tools: {} })).toThrowError(/identità/i);
  });

  it('rifiuta a tempo di compilazione ed esecuzione se terminations è vuoto', () => {
    const noTermAgent = defineAgent({
      identity: 'Agente Senza Termine',
      mission: 'Non finisce mai',
      tools: {},
      // @ts-expect-error Segnalato a tempo di compilazione: terminations non può essere un oggetto vuoto
      terminations: {}
    });

    expect(() => noTermAgent.implement({ tools: {} })).toThrowError(/terminazione/i);
  });

  it('rifiuta la costruzione se un tool dichiarato manca di esecutore nel binding', () => {
    const toolAgent = defineAgent({
      identity: 'Agente Tool Incompleto',
      mission: 'Test tool',
      tools: {
        azione_richiesta: {
          description: 'Azione senza esecutore',
          parameters: z.object({ x: z.number() })
        }
      },
      terminations: {
        fine: { description: 'Fine', schema: z.object({}) }
      }
    });

    expect(() =>
      toolAgent.implement({
        // @ts-expect-error Verifica runtime per JS o bypass di compilazione
        tools: {}
      })
    ).toThrowError(/azione_richiesta/i);
  });

  it('rifiuta la costruzione se stateSchema è dichiarato ma initialState non rispetta lo schema', () => {
    const statefulAgent = defineAgent({
      identity: 'Agente Stato Rigido',
      mission: 'Gestisce uno stato numerico',
      stateSchema: z.object({ contatore: z.number().min(10) }),
      tools: {},
      terminations: {
        fine: { description: 'Fine', schema: z.object({}) }
      }
    });

    expect(() =>
      statefulAgent.implement({
        initialState: { contatore: 2 },
        tools: {}
      })
    ).toThrowError(/stateSchema/i);
  });

  it('rifiuta concetti incompleti privi di name, descrizione o corpo', () => {
    const badConceptAgent = defineAgent({
      identity: 'Agente Concetto Non Valido',
      mission: 'Test',
      knowledge: [
        { name: 'c1', descrizione: '', corpo: 'test' }
      ],
      tools: {},
      terminations: {
        fine: { description: 'Fine', schema: z.object({}) }
      }
    });

    expect(() => badConceptAgent.implement({ tools: {} })).toThrowError(/concetto #1/i);
  });

  it('rifiuta a tempo di compilazione schemi che non appartengono allo spazio discreto DataValue', () => {
    const schemaWithFunction = z.object({
      callback: z.function()
    });

    defineAgent({
      identity: 'Agente Invalido',
      mission: 'Test',
      tools: {
        // @ts-expect-error Segnalato dal compilatore: il parametro contiene una funzione non-JSON
        tool_invalido: {
          description: 'Non serializzabile',
          parameters: schemaWithFunction
        }
      },
      terminations: {
        // @ts-expect-error Segnalato dal compilatore: la terminazione contiene una funzione non-JSON
        termina_invalido: {
          description: 'Non serializzabile',
          schema: schemaWithFunction
        }
      }
    });
  });
});
