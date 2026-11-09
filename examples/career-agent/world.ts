import { z } from "zod";
import { createWorldRegistry, type WorldRegistry, type WorldTool } from "@formal-agent/core";
import type { ExtractedWebPage, MockWebPage, WebSearchResult } from "./types.js";
import { extractWebPage } from "./extractor.js";

/**
 * Grafo del Web moccato con pagine HTML realistiche per testare l'agente.
 */
export const MOCK_WEB_DATABASE: Record<string, MockWebPage> = {
  // ============================================================================
  // AZIENDA 1: ACME CORP (Carriere sul proprio dominio ufficiale)
  // ============================================================================
  "https://www.acmecorp.com": {
    url: "https://www.acmecorp.com",
    title: "Acme Corp - Leader nelle Soluzioni Tecnologiche",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>Acme Corp - Leader nelle Soluzioni Tecnologiche</title></head>
        <body>
          <header>
            <nav>
              <a href="/prodotti">I Nostri Prodotti</a>
              <a href="/chi-siamo">Chi Siamo</a>
            </nav>
          </header>
          <main>
            <h1>Innovazione e Tecnologia Industriale</h1>
            <p>Acme Corp fornisce soluzioni software e hardware di ultima generazione per l'automazione.</p>
          </main>
          <footer>
            <p>&copy; 2026 Acme Corp Inc.</p>
            <nav>
              <a href="/privacy">Privacy Policy</a>
              <a href="/careers">Lavora con noi (Careers)</a>
              <a href="/contatti">Contattaci</a>
            </nav>
          </footer>
        </body>
      </html>
    `,
  },
  "https://www.acmecorp.com/careers": {
    url: "https://www.acmecorp.com/careers",
    title: "Carriere e Lavora con Noi - Acme Corp Ufficiale",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>Carriere e Lavora con Noi - Acme Corp Ufficiale</title></head>
        <body>
          <header>
            <a href="/">Home Acme Corp</a>
          </header>
          <main>
            <h1>Unisciti al Team di Acme Corp</h1>
            <p>Siamo costantemente alla ricerca di talenti appassionati di ingegneria e design.</p>
            <h2>Posizioni Aperte:</h2>
            <ul>
              <li><strong>Senior TypeScript Engineer</strong> - Sede Milano / Remoto</li>
              <li><strong>Cloud Solutions Architect</strong> - Remoto</li>
              <li><strong>Product Designer UI/UX</strong> - Sede Roma</li>
            </ul>
            <p>Invia la tua candidatura formale a: recruiting@acmecorp.com</p>
          </main>
        </body>
      </html>
    `,
  },
  "https://it.linkedin.com/jobs/acme-corp": {
    url: "https://it.linkedin.com/jobs/acme-corp",
    title: "Lavori presso Acme Corp | LinkedIn Jobs",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>Lavori presso Acme Corp | LinkedIn Jobs</title></head>
        <body>
          <h1>Offerte di Lavoro per Acme Corp su LinkedIn</h1>
          <p>Visualizza le 5 offerte di lavoro pubblicate dagli utenti per Acme Corp. Iscriviti a LinkedIn per candidarti.</p>
        </body>
      </html>
    `,
  },

  // ============================================================================
  // AZIENDA 2: FINTECH NOVA (Carriere su ATS Ufficiale esterno: Greenhouse)
  // ============================================================================
  "https://www.fintechnova.io": {
    url: "https://www.fintechnova.io",
    title: "FintechNova - Il Futuro dei Pagamenti Digitali",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>FintechNova - Il Futuro dei Pagamenti Digitali</title></head>
        <body>
          <header>
            <nav>
              <a href="/features">Caratteristiche</a>
              <a href="/pricing">Piani</a>
            </nav>
          </header>
          <main>
            <h1>La piattaforma di pagamento per le imprese europee</h1>
            <p>Elaborazione pagamenti istantanei e conformità PSD3 con API moderne.</p>
          </main>
          <footer>
            <div class="footer-links">
              <a href="/legal">Note Legali</a>
              <a href="https://boards.greenhouse.io/fintechnova">Join our team (Openings)</a>
            </div>
          </footer>
        </body>
      </html>
    `,
  },
  "https://boards.greenhouse.io/fintechnova": {
    url: "https://boards.greenhouse.io/fintechnova",
    title: "FintechNova Job Board | Powered by Greenhouse",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>FintechNova Job Board | Powered by Greenhouse</title></head>
        <body>
          <h1>Current Openings at FintechNova</h1>
          <p>We are building the next generation of financial infrastructure. Apply below:</p>
          <ul>
            <li>Staff Backend Engineer (Go / Rust)</li>
            <li>Head of Compliance & AML</li>
          </ul>
        </body>
      </html>
    `,
  },

  // ============================================================================
  // AZIENDA 3: BOTTEGA DIGITALE (Azienda reale MA priva di pagina carriere)
  // ============================================================================
  "https://www.bottegadigitale.it": {
    url: "https://www.bottegadigitale.it",
    title: "Bottega Digitale - Studio Artigianale di Sviluppo Web",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>Bottega Digitale - Studio Artigianale di Sviluppo Web</title></head>
        <body>
          <main>
            <h1>Benvenuti in Bottega Digitale</h1>
            <p>Siamo uno studio artigianale composto da 3 soci fondatori. Curiamo progetti web su misura.</p>
            <section class="avviso">
              <h2>Nota sulle Posizioni Lavorative</h2>
              <p>Siamo una realtà chiusa e autonoma: al momento il nostro team è al completo e NON abbiamo posizioni aperte né una sezione carriere. Non accettiamo candidature spontanee.</p>
            </section>
          </main>
          <footer>
            <a href="/portfolio">I Nostri Lavori</a>
            <a href="/contatti">Scrivici per un preventivo</a>
          </footer>
        </body>
      </html>
    `,
  },

  // ============================================================================
  // AZIENDA 4: GHOST TECH (Azienda inesistente / Directory generiche terze)
  // ============================================================================
  "https://www.registro-aziende-directory.it/ghosttech-srl": {
    url: "https://www.registro-aziende-directory.it/ghosttech-srl",
    title: "GhostTech S.R.L. - Dati Aziendali e Bilancio | Registro Directory",
    html: `
      <!DOCTYPE html>
      <html>
        <head><title>GhostTech S.R.L. - Dati Aziendali</title></head>
        <body>
          <h1>GhostTech S.R.L.</h1>
          <p>Partita IVA: 09876543210 - Stato: ATTIVA. Sede legale: Roma.</p>
          <p>Nessun sito web ufficiale o contatto email dichiarato.</p>
        </body>
      </html>
    `,
  },
};

/**
 * Client del Mondo Web Moccato.
 */
export class MockWebWorldClient {
  private pages: Record<string, MockWebPage>;

  constructor(customPages: Record<string, MockWebPage> = MOCK_WEB_DATABASE) {
    this.pages = customPages;
  }

  /**
   * Simula un motore di ricerca web.
   */
  public search(query: string): WebSearchResult[] {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);

    const matches: Array<{ page: MockWebPage; score: number }> = [];

    for (const page of Object.values(this.pages)) {
      let score = 0;
      const titleLower = page.title.toLowerCase();
      const contentLower = page.html.toLowerCase();
      const urlLower = page.url.toLowerCase();

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 5;
        if (urlLower.includes(token)) score += 3;
        if (contentLower.includes(token)) score += 1;
      }

      if (score > 0) {
        matches.push({ page, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    return matches.slice(0, 4).map(({ page }) => {
      // Estrai un breve snippet dal body
      const extracted = extractWebPage(page.html, page.url);
      const snippet =
        extracted.summary.length > 180
          ? extracted.summary.slice(0, 180) + "..."
          : extracted.summary;

      return {
        title: page.title,
        url: page.url,
        snippet,
      };
    });
  }

  /**
   * Simula la lettura ed estrazione di una pagina web tramite Cheerio.
   */
  public fetchAndExtract(url: string): ExtractedWebPage {
    const normalized = url.trim().replace(/\/$/, "");
    
    // Cerca match esatto o senza slash finale
    const page =
      this.pages[url] ||
      this.pages[normalized] ||
      this.pages[`${normalized}/`];

    if (!page) {
      throw new Error(`HTTP 404: Pagina web non trovata all'indirizzo '${url}'`);
    }

    return extractWebPage(page.html, page.url);
  }
}

/**
 * Schemi di ritorno Zod per i tool fisici del mondo web
 */
export const cercaWebReturnSchema = z.object({
  query_eseguita: z.string().describe("Query cercata"),
  risultati: z
    .array(
      z.object({
        title: z.string().describe("Titolo del risultato"),
        url: z.string().describe("Indirizzo web del risultato"),
        snippet: z.string().describe("Estratto sintetico"),
      })
    )
    .describe("Elenco dei migliori risultati trovati dal motore di ricerca"),
});

export const leggiPaginaWebReturnSchema = z.object({
  successo: z.boolean().describe("Indica se la pagina è stata letta con successo"),
  url: z.string().describe("URL consultato"),
  titolo: z.string().nullable().describe("Titolo della pagina web"),
  contenuto_estratto: z.string().nullable().describe("Sintesi del testo principale della pagina"),
  link_rilevanti: z
    .array(
      z.object({
        testo: z.string().describe("Testo del link (es. 'Lavora con noi')"),
        url: z.string().describe("URL di destinazione"),
      })
    )
    .describe("Link rilevanti individuati nell'header, nel footer o nel testo della pagina"),
  errore: z.string().nullable().describe("Messaggio di errore in caso di fallimento della richiesta"),
});

/**
 * Factory per creare il registro del Mondo Web per l'agente.
 */
export function createCareerWorld(client: MockWebWorldClient = new MockWebWorldClient()): WorldRegistry {
  const cercaWebTool: WorldTool = {
    id: "w_cerca_web",
    description: "Esegue una ricerca web restituendo i migliori risultati con titolo, URL e snippet.",
    parameters: z.object({
      query: z.string().min(2).describe("Parole chiave di ricerca (es. 'Acme Corp sito ufficiale lavora con noi')"),
    }),
    returns: cercaWebReturnSchema,
    execute: async ({ query }) => {
      const risultati = client.search(query);
      return {
        query_eseguita: query,
        risultati,
      };
    },
  };

  const leggiPaginaWebTool: WorldTool = {
    id: "w_leggi_pagina_web",
    description: "Visita un URL ed estrae il titolo, il testo sintetico e tutti i link di navigazione pertinenti (inclusi header e footer).",
    parameters: z.object({
      url: z.string().describe("URL della pagina web da visitare ed esaminare"),
    }),
    returns: leggiPaginaWebReturnSchema,
    execute: async ({ url }) => {
      try {
        const page = client.fetchAndExtract(url);
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

