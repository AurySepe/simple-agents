import * as cheerio from "cheerio";
import { z } from "zod";
import { createWorldRegistry, type WorldRegistry, type WorldTool } from "../../src/index.js";
import type { ExtractedWebPage, WebSearchResult } from "./types.js";
import { extractWebPage } from "./extractor.js";
import { cercaWebReturnSchema, leggiPaginaWebReturnSchema } from "./world.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface LiveWebWorldClientOptions {
  userAgent?: string;
  defaultMaxResults?: number;
  fetchTimeoutMs?: number;
}

/**
 * Client reale per navigare e cercare sul Web online.
 * - Ricerche reali via DuckDuckGo HTML
 * - Fetching HTTP reale con pulizia Cheerio
 */
export class LiveWebWorldClient {
  private userAgent: string;
  private defaultMaxResults: number;
  private fetchTimeoutMs: number;

  constructor(options?: LiveWebWorldClientOptions) {
    this.userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
    this.defaultMaxResults = options?.defaultMaxResults ?? 5;
    this.fetchTimeoutMs = options?.fetchTimeoutMs ?? 15000;
  }

  /**
   * Esegue una ricerca online reale su DuckDuckGo ed estrae i risultati.
   */
  public async search(query: string, maxResults?: number): Promise<WebSearchResult[]> {
    const limit = maxResults ?? this.defaultMaxResults;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: AbortSignal.timeout(this.fetchTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Errore HTTP DuckDuckGo: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: WebSearchResult[] = [];

      $(".result").each((_, element) => {
        if (results.length >= limit) return;

        const linkEl = $(element).find(".result__title a");
        const snippetEl = $(element).find(".result__snippet");

        const rawTitle = linkEl.text().replace(/\s+/g, " ").trim();
        const rawHref = linkEl.attr("href") ?? "";
        const snippet = snippetEl.text().replace(/\s+/g, " ").trim();

        if (!rawTitle || !rawHref) return;

        // Decodifica l'URL reale dal redirect di DuckDuckGo (parametro uddg)
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Fallimento ricerca online per '${query}': ${errorMsg}`);
    }
  }

  /**
   * Rileva se una pagina HTML scaricata è solo un guscio vuoto di una Single Page Application (SPA).
   */
  private isSpaShell(
    html: string,
    summary: string,
    url: string,
    relevantLinksCount: number
  ): boolean {
    const cleanText = summary.trim();
    const urlLower = url.toLowerCase();

    // 1. Dominio o path noto per essere un'applicazione web SPA o portale ATS dinamico
    const knownSpaPatterns = [
      "ashbyhq.com",
      "myworkdayjobs.com",
      "smartrecruiters.com",
      "taleo.net",
      "phenompeople.com",
      "eightfold.ai",
      "icims.com",
    ];
    if (knownSpaPatterns.some((d) => urlLower.includes(d))) {
      return true;
    }

    // 2. Testo utile quasi assente
    if (cleanText.length < 120) {
      return true;
    }

    // 3. Portali con componenti Search SPA (es. SearchContent di Amazon)
    // dove i risultati di ricerca delle offerte sono caricati dinamicamente via JS/React
    const hasSpaFramework =
      html.includes('data-react-class="SearchContent"') ||
      html.includes('id="root"') ||
      html.includes('id="app"') ||
      html.includes('id="__next"') ||
      html.includes("<app-root>");

    if (
      hasSpaFramework &&
      (cleanText.length < 350 || (urlLower.includes("search") && relevantLinksCount === 0))
    ) {
      return true;
    }

    // 4. Avviso di JavaScript disabilitato
    if (html.toLowerCase().includes("enable javascript")) {
      return true;
    }

    return false;
  }

  /**
   * Esegue il rendering JavaScript di fallback per pagine SPA dinamiche.
   */
  private async renderWithFallback(url: string): Promise<ExtractedWebPage> {
    const fallbackUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(fallbackUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": this.userAgent,
      },
      signal: AbortSignal.timeout(this.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Fallback rendering fallito con status ${response.status}`);
    }

    const text = await response.text();

    // Estrai il titolo restituito dal renderer
    const lines = text.split("\n");
    const titleLine = lines.find((l) => l.startsWith("Title:"));
    const title = titleLine ? titleLine.replace("Title:", "").trim() : url;

    // Isola il corpo Markdown
    const markdownMarker = "Markdown Content:";
    const markerIndex = text.indexOf(markdownMarker);
    const bodyContent =
      markerIndex !== -1 ? text.slice(markerIndex + markdownMarker.length).trim() : text;

    // Estrai i link del Markdown [Testo](url)
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    const links: Array<{ text: string; url: string }> = [];
    const seenUrls = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(bodyContent)) !== null && links.length < 10) {
      const linkText = match[1].replace(/\s+/g, " ").trim();
      const linkUrl = match[2];

      if (!seenUrls.has(linkUrl) && linkText.length > 2 && linkText.length < 90) {
        seenUrls.add(linkUrl);
        links.push({ text: linkText, url: linkUrl });
      }
    }

    // Pulisci e tronca il sommario
    const cleanBody = bodyContent
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Rimuovi sintassi link lasciando il testo
      .replace(/[#*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const summary =
      cleanBody.length > 1800 ? cleanBody.slice(0, 1800) + " [...]" : cleanBody;

    return {
      url,
      title,
      summary,
      relevantLinks: links,
    };
  }

  /**
   * Scarica una pagina web reale tramite HTTP ed estrae testo e link rilevanti.
   * Se la pagina è una SPA con contenuto renderizzato in JS, attiva il fallback dinamico.
   */
  public async fetchAndExtract(url: string): Promise<ExtractedWebPage> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(this.fetchTimeoutMs),
      });

      if (!response.ok) {
        // Se il server restituisce 400, 403 o 503 (blocco edge o bot protection come Meta),
        // tenta il fallback dinamico prima di arrendersi
        if ([400, 403, 503].includes(response.status)) {
          try {
            return await this.renderWithFallback(url);
          } catch {
            // Continua e lancia l'errore HTTP originale
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        throw new Error(`Contenuto non HTML: ${contentType}`);
      }

      const html = await response.text();
      // Usiamo l'URL finale dopo eventuali redirect HTTP
      const finalUrl = response.url || url;

      const extracted = extractWebPage(html, finalUrl);

      // Se la pagina è una SPA vuota, tenta il rendering di fallback
      if (this.isSpaShell(html, extracted.summary, finalUrl, extracted.relevantLinks.length)) {
        try {
          const rendered = await this.renderWithFallback(finalUrl);
          if (rendered.relevantLinks.length > 0 || rendered.summary.length > 100) {
            return rendered;
          }
        } catch {
          // Se il fallback fallisce, restituisci comunque il risultato base
        }
      }

      return extracted;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Impossibile leggere la pagina web '${url}': ${errorMsg}`);
    }
  }
}

/**
 * Factory per creare il registro del Mondo Web REALE per l'agente.
 */
export function createLiveCareerWorld(
  client: LiveWebWorldClient = new LiveWebWorldClient()
): WorldRegistry {
  const cercaWebTool: WorldTool = {
    id: "w_cerca_web",
    description: "Esegue una ricerca web online restituendo i migliori risultati con titolo, URL e snippet.",
    parameters: z.object({
      query: z.string().min(2).describe("Parole chiave di ricerca (es. 'Ferrari sito ufficiale carriere')"),
    }),
    returns: cercaWebReturnSchema,
    execute: async ({ query }) => {
      const risultati = await client.search(query);
      return {
        query_eseguita: query,
        risultati,
      };
    },
  };

  const leggiPaginaWebTool: WorldTool = {
    id: "w_leggi_pagina_web",
    description:
      "Visita un URL reale ed estrae il titolo, il testo sintetico e tutti i link di navigazione pertinenti (inclusi header e footer).",
    parameters: z.object({
      url: z.string().url().describe("URL della pagina web reale da visitare ed esaminare"),
    }),
    returns: leggiPaginaWebReturnSchema,
    execute: async ({ url }) => {
      try {
        const page = await client.fetchAndExtract(url);
        return {
          successo: true,
          url: page.url,
          titolo: page.title,
          contenuto_estratto: page.summary,
          link_rilevanti: page.relevantLinks.map((l) => ({ testo: l.text, url: l.url })),
          errore: null,
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          successo: false,
          url,
          titolo: null,
          contenuto_estratto: null,
          link_rilevanti: [],
          errore: errorMsg,
        };
      }
    },
  };

  return createWorldRegistry([cercaWebTool, leggiPaginaWebTool]);
}
