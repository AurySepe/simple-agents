import { AgentState, CanonicalCognitiveActionId } from '../../types/index.js';

/**
 * ============================================================================
 * HANDLER COMPUTAZIONALI COGNITIVI PURI (In-Memory)
 * ============================================================================
 * Le logiche di mutazione dello stato S sono scritte UNA SOLA VOLTA e sono
 * completamente agnostiche rispetto alla lingua, ai nomi esposti all'LLM e alle descrizioni.
 */
export const inMemoryCognitiveHandlers: Record<
  CanonicalCognitiveActionId,
  (args: any, state: AgentState) => Promise<unknown> | unknown
> = {
  aggiorna_missione: (args: { nuovo_scopo: string }, state: AgentState) => {
    state.Ms = args.nuovo_scopo;
  },

  imposta_dato: (args: { chiave: string; valore: unknown }, state: AgentState) => {
    state.Ds[args.chiave] = args.valore;
  },

  elimina_dato: (args: { chiave: string }, state: AgentState) => {
    delete state.Ds[args.chiave];
  },

  compatta_memoria: (
    args: { start_idx: number; end_idx: number; sintesi: string },
    state: AgentState
  ) => {
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

  cerca_tool: (args: { query: string }) => {
    return {
      query: args.query,
      results: []
    };
  },

  carica_tool: (args: { tool_ids: string[] }, state: AgentState) => {
    for (const toolId of args.tool_ids) {
      state.Ta.add(toolId);
    }
  },

  scarica_tool: (args: { tool_ids: string[] }, state: AgentState) => {
    for (const toolId of args.tool_ids) {
      state.Ta.delete(toolId);
    }
  },

  cerca_concetti: (args: { query: string }) => {
    return {
      query: args.query,
      results: []
    };
  },

  carica_concetto: (args: { concetto_ids: string[] }, state: AgentState) => {
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

  scarica_concetto: (args: { concetto_ids: string[] }, state: AgentState) => {
    for (const id of args.concetto_ids) {
      state.Ka.delete(id);
    }
  }
};

