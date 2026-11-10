import * as cheerio from "cheerio";
import { toolOk, toolFail, ToolReturn } from "@formal-agent/core";
import { extractWebPage } from "./extractor.js";
import { careerAgentContract } from "./contract.js";
import type {
  ExtractedWebPage,
  WebSearchResult,
  WebSearchError,
  WebScrapeError,
  CareerAgentToolErrors,
} from "./types.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * ============================================================================
 * CLIENT WEB REALE (DuckDuckGo + Fetch HTTP + Cheerio + SPA Fallback)
 * ============================================================================
 */
export class RealWebClient {
  private userAgent: string;
  private timeoutMs: number;

  constructor(options?: { userAgent?: string; timeoutMs?: number }) {
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options?.timeoutMs ?? 15000;
  }

  /**
   * Esegue una ricerca reale su DuckDuckGo HTML ed estrae titolo, URL e snippet.
   */
  public async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: WebSearchResult[] = [];

      $(".result").each((_, element) => {
        if (results.length >= maxResults) return;

        const linkEl = $(element).find(".result__title a");
        const snippetEl = $(element).find(".result__snippet");

        const rawTitle = linkEl.text().replace(/\s+/g, " ").trim();
        const rawHref = linkEl.attr("href") ?? "";
        const snippet = snippetEl.text().replace(/\s+/g, " ").trim();

        if (!rawTitle || !rawHref) return;

        // Decodifica redirect di DuckDuckGo (?uddg=...)
        let targetUrl = rawHref;
        if (rawHref.includes("uddg=")) {
          const match = rawHref.match(/uddg=([^&]+)/);
          if (match && match[1]) {
            targetUrl = decodeURIComponent(match[1]);
          }
        } else if (rawHref.startsWith("//")) {
          targetUrl = `https:${rawHref}`;
        }

        results.push({
          title: rawTitle,
          url: targetUrl,
          snippet: snippet.length > 220 ? `${snippet.slice(0, 220)}...` : snippet,
        });
      });

      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Errore durante la ricerca web per '${query}': ${msg}`);
    }
  }

  /**
   * Scarica una pagina web reale tramite HTTP ed estrae testo e link rilevanti.
   * Se la pagina è una SPA (Single Page App) priva di testo, attiva il fallback reader.
   */
  public async fetchAndExtract(url: string): Promise<{
    successo: boolean;
    url: string;
    titolo: string | null;
    contenuto_estratto: string | null;
    link_rilevanti: Array<{ testo: string; url: string }>;
    errore: string | null;
  }> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        // Tenta fallback per portali protetti da bot-guard o SPA
        if ([400, 403, 503].includes(response.status)) {
          const fallback = await this.renderWithFallback(url);
          return {
            successo: true,
            url: fallback.url,
            titolo: fallback.title,
            contenuto_estratto: fallback.summary,
            link_rilevanti: fallback.relevantLinks.map((l) => ({ testo: l.text, url: l.url })),
            errore: null,
          };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const finalUrl = response.url || url;
      const extracted = extractWebPage(html, finalUrl);

      // Se la pagina è uno shell vuoto di React/Vue/Workday, attiva il reader dinamico
      if (this.isSpaShell(html, extracted.summary, finalUrl)) {
        try {
          const fallback = await this.renderWithFallback(finalUrl);
          if (fallback.relevantLinks.length > 0 || fallback.summary.length > 100) {
            return {
              successo: true,
              url: fallback.url,
              titolo: fallback.title,
              contenuto_estratto: fallback.summary,
              link_rilevanti: fallback.relevantLinks.map((l) => ({ testo: l.text, url: l.url })),
              errore: null,
            };
          }
        } catch {
          // Mantieni l'estrazione statica se il fallback fallisce
        }
      }

      return {
        successo: true,
        url: extracted.url,
        titolo: extracted.title,
        contenuto_estratto: extracted.summary,
        link_rilevanti: extracted.relevantLinks.map((l) => ({ testo: l.text, url: l.url })),
        errore: null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        successo: false,
        url,
        titolo: null,
        contenuto_estratto: null,
        link_rilevanti: [],
        errore: msg,
      };
    }
  }

  private isSpaShell(html: string, summary: string, url: string): boolean {
    const cleanText = summary.trim();
    const urlLower = url.toLowerCase();
    const knownSpa = ["workday", "ashbyhq", "smartrecruiters", "greenhouse", "lever", "taleo", "icims"];
    if (knownSpa.some((p) => urlLower.includes(p))) return true;
    if (cleanText.length < 120) return true;
    if (html.toLowerCase().includes("enable javascript")) return true;
    return false;
  }

  private async renderWithFallback(url: string): Promise<ExtractedWebPage> {
    const fallbackUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(fallbackUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": this.userAgent,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Fallback reader status ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split("\n");
    const titleLine = lines.find((l) => l.startsWith("Title:"));
    const title = titleLine ? titleLine.replace("Title:", "").trim() : url;

    const marker = "Markdown Content:";
    const markerIdx = text.indexOf(marker);
    const bodyContent = markerIdx !== -1 ? text.slice(markerIdx + marker.length).trim() : text;

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    const links: Array<{ text: string; url: string }> = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(bodyContent)) !== null && links.length < 10) {
      const linkText = match[1].replace(/\s+/g, " ").trim();
      const linkUrl = match[2];
      if (!seen.has(linkUrl) && linkText.length > 2 && linkText.length < 80) {
        seen.add(linkUrl);
        links.push({ text: linkText, url: linkUrl });
      }
    }

    const cleanSummary = bodyContent
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      url,
      title,
      summary: cleanSummary.length > 1800 ? cleanSummary.slice(0, 1800) + " [...]" : cleanSummary,
      relevantLinks: links,
    };
  }
}

/**
 * ============================================================================
 * IMPLEMENTAZIONE REALE DELL'AGENTE (Zero Mock)
 * ============================================================================
 * Collega i tool dichiarati nel contratto cognitivo con il client web reale,
 * gestendo gli errori infrastrutturali in modo tipizzato con toolOk e toolFail.
 */
export function createCareerAgent(client: RealWebClient = new RealWebClient()) {
  return careerAgentContract.implement<CareerAgentToolErrors>({
    tools: {
      w_cerca_web: async ({ query }) => {
        try {
          const risultati = await client.search(query);
          return toolOk({ query_eseguita: query, risultati });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timeout') || msg.includes('AbortError')) {
            return toolFail({
              type: 'NETWORK_TIMEOUT' as const,
              url: 'https://html.duckduckgo.com',
              timeoutMs: 15000,
              message: `Timeout durante la ricerca per '${query}'`
            });
          }
          if (msg.includes('HTTP')) {
            return toolFail({
              type: 'HTTP_ERROR' as const,
              url: 'https://html.duckduckgo.com',
              status: 503,
              statusText: msg,
              message: msg
            });
          }
          return toolFail({
              type: 'SEARCH_ENGINE_UNAVAILABLE' as const,
            message: msg
          });
        }
      },
      w_leggi_pagina_web: async ({ url }) => {
        try {
          const result = await client.fetchAndExtract(url);
          return toolOk(result);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('timeout') || msg.includes('AbortError')) {
            return toolFail({
              type: 'NETWORK_TIMEOUT' as const,
              url,
              timeoutMs: 15000,
              message: `Timeout durante il caricamento di ${url}`
            });
          }
          return toolFail({
            type: 'PAGE_PARSING_FAILED' as const,
            url,
            message: msg
          });
        }
      },
    },
  });
}

/**
 * Istanza pronta all'uso dell'agente con il client web online.
 */
export const careerAgent = createCareerAgent();
