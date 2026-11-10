import type { DataValue } from "@formal-agent/core";

/**
 * Tipi di dominio per l'agente di ricerca carriere web.
 */

export interface WebSearchResult {
  [key: string]: DataValue;
  title: string;
  url: string;
  snippet: string;
}

export interface WebLink {
  [key: string]: DataValue;
  text: string;
  url: string;
}

export interface ExtractedWebPage {
  url: string;
  title: string;
  summary: string;
  relevantLinks: WebLink[];
}

export interface MockWebPage {
  url: string;
  title: string;
  html: string;
}

export type EsitoRicercaTipo = "TROVATA" | "INESISTENTE" | "NON_CONCLUSIVA";

export interface EsitoRicerca {
  tipo: EsitoRicercaTipo;
  url?: string;
  motivo: string;
  evidenze?: string[];
}

export interface CareerAgentState {
  azienda_target: string;
  descrizione_o_contesto?: string;
  query_eseguite: string[];
  url_esplorati: string[];
  candidati_da_verificare: string[];
  budget_passi_rimasti: number;
  esito_finale?: EsitoRicerca;
}

/**
 * ============================================================================
 * ERRORI INFRASTRUTTURALI / AMBIENTALI DEL WEB (Rete, Timeout, HTTP)
 * ============================================================================
 * Distinti nettamente dalla logica di dominio (esito ricerca trovata o no).
 */
export type WebSearchError =
  | { type: 'NETWORK_TIMEOUT'; url: string; timeoutMs: number; message: string }
  | { type: 'HTTP_ERROR'; url: string; status: number; statusText: string; message: string }
  | { type: 'SEARCH_ENGINE_UNAVAILABLE'; message: string };

export type WebScrapeError =
  | { type: 'NETWORK_TIMEOUT'; url: string; timeoutMs: number; message: string }
  | { type: 'HTTP_ERROR'; url: string; status: number; statusText: string; message: string }
  | { type: 'PAGE_PARSING_FAILED'; url: string; message: string };

export type CareerAgentToolErrors = {
  w_cerca_web: WebSearchError;
  w_leggi_pagina_web: WebScrapeError;
};

