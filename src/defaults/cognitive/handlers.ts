import {
  AgentState,
  CanonicalCognitiveActionId,
  CognitiveActionArgsMap,
  DataValue,
  ToolResult
} from '../../types/index.js';

export type { CognitiveActionArgsMap };

/**
 * ============================================================================
 * HANDLER COMPUTAZIONALI COGNITIVI PURI (In-Memory)
 * ============================================================================
 * Le logiche di mutazione dello stato S sono scritte UNA SOLA VOLTA e sono
 * completamente agnostiche rispetto alla lingua, ai nomi esposti all'LLM e alle descrizioni.
 */
export const inMemoryCognitiveHandlers: {
  [K in CanonicalCognitiveActionId]: (
    args: CognitiveActionArgsMap[K],
    state: AgentState
  ) => Promise<ToolResult> | ToolResult;
} = {
  aggiorna_missione: (args, state) => {
    state.Ms = args.nuovo_scopo;
  },

  imposta_dato: (args, state) => {
    state.Ds[args.chiave] = args.valore;
  },

  elimina_dato: (args, state) => {
    delete state.Ds[args.chiave];
  },

  compatta_memoria: (args, state) => {
    if (args.start_idx < 0 || args.end_idx >= state.Ep.length || args.start_idx > args.end_idx) {
      throw new Error(
        `Intervallo [${args.start_idx}, ${args.end_idx}] non valido per la cronologia Ep (lunghezza attuale: ${state.Ep.length})`
      );
    }
    const count = args.end_idx - args.start_idx + 1;
    state.Ep.splice(args.start_idx, count, {
      index: args.start_idx,
      role: 'orchestrator',
      channel: 'summary',
      content: args.sintesi
    });
    for (let i = 0; i < state.Ep.length; i++) {
      state.Ep[i].index = i;
    }
  },

  cerca_tool: (args) => {
    return {
      query: args.query,
      results: []
    };
  },

  carica_tool: (args, state) => {
    for (const toolId of args.tool_ids) {
      state.Ta.add(toolId);
    }
  },

  scarica_tool: (args, state) => {
    for (const toolId of args.tool_ids) {
      state.Ta.delete(toolId);
    }
  },

  cerca_concetti: (args) => {
    return {
      query: args.query,
      results: []
    };
  },

  carica_concetto: (args, state) => {
    for (const id of args.concetto_ids) {
      if (!state.Ka.has(id)) {
        state.Ka.set(id, {
          id,
          descrizione: `Concetto ${id}`,
          corpo: `Contenuto semantico del concetto ${id}`
        });
      }
    }
  },

  scarica_concetto: (args, state) => {
    for (const id of args.concetto_ids) {
      state.Ka.delete(id);
    }
  }
};

