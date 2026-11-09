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

