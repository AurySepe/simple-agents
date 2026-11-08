import { describe, expect, it } from "vitest";
import { extractWebPage } from "../examples/career-agent/extractor.js";
import {
  createCareerWorld,
  MockWebWorldClient,
  MOCK_WEB_DATABASE,
} from "../examples/career-agent/world.js";
import { createLiveCareerWorld } from "../examples/career-agent/live-world.js";
import {
  careerAgentManifest,
  confermaPaginaCarriereSchema,
  segnalaPaginaInesistenteSchema,
  segnalaRicercaNonConclusivaSchema,
} from "../examples/career-agent/manifest.js";
import { CAREER_SCENARIOS } from "../examples/career-agent/scenarios.js";

describe("Career Web Agent - Suite di Test", () => {
  describe("Extractor HTML con Cheerio", () => {
    it("deve estrarre titolo, testo sintetico e link alle carriere da HTML con header e footer", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Azienda Test - Homepage</title></head>
          <body>
            <header>
              <nav>
                <a href="/chi-siamo">Chi Siamo</a>
                <a href="/prodotti">Prodotti</a>
              </nav>
            </header>
            <main>
              <h1>Benvenuti in Azienda Test</h1>
              <p>Costruiamo soluzioni software di alto livello per l'automazione.</p>
            </main>
            <footer>
              <a href="/careers">Lavora con noi</a>
              <a href="https://boards.greenhouse.io/aziendatest">Open Positions (ATS)</a>
              <a href="/privacy">Privacy</a>
            </footer>
          </body>
        </html>
      `;

      const result = extractWebPage(html, "https://www.aziendatest.com");

      expect(result.title).toBe("Azienda Test - Homepage");
      expect(result.summary).toContain("Costruiamo soluzioni software");
      expect(result.relevantLinks.length).toBeGreaterThanOrEqual(2);

      const urls = result.relevantLinks.map((l) => l.url);
      expect(urls).toContain("https://www.aziendatest.com/careers");
      expect(urls).toContain("https://boards.greenhouse.io/aziendatest");
      expect(urls).not.toContain("https://www.aziendatest.com/privacy");
    });

    it("deve convertire correttamente URL relativi in assoluti", () => {
      const html = `
        <html>
          <body>
            <a href="jobs/openings">Opportunità di Lavoro</a>
          </body>
        </html>
      `;
      const result = extractWebPage(html, "https://example.com/company/");
      expect(result.relevantLinks[0].url).toBe("https://example.com/company/jobs/openings");
    });
  });

  describe("Mondo Web Moccato", () => {
    const client = new MockWebWorldClient();

    it("deve restituire i risultati di ricerca corretti per Acme Corp", () => {
      const searchResults = client.search("Acme Corp careers lavora con noi");
      expect(searchResults.length).toBeGreaterThan(0);
      const urls = searchResults.map((r) => r.url);
      expect(urls).toContain("https://www.acmecorp.com");
      expect(urls).toContain("https://www.acmecorp.com/careers");
    });

    it("deve lanciare errore 404 per URL inesistenti", () => {
      expect(() => client.fetchAndExtract("https://www.inesistente.com")).toThrow(/HTTP 404/);
    });

    it("deve consentire al WorldRegistry di invocare w_cerca_web e w_leggi_pagina_web", async () => {
      const world = createCareerWorld(client);

      const cercaRes = (await world.executeTool("w_cerca_web", { query: "FintechNova" })) as {
        risultati: Array<{ url: string }>;
      };
      expect(cercaRes.risultati.length).toBeGreaterThan(0);
      expect(cercaRes.risultati[0].url).toBe("https://www.fintechnova.io");

      const leggiRes = (await world.executeTool("w_leggi_pagina_web", {
        url: "https://www.fintechnova.io",
      })) as {
        successo: boolean;
        link_rilevanti: Array<{ testo: string; url: string }>;
      };
      expect(leggiRes.successo).toBe(true);
      expect(leggiRes.link_rilevanti.some((l) => l.url.includes("greenhouse.io"))).toBe(true);
    });
  });

  describe("Manifesto e Schemi Terminali", () => {
    it("deve validare il payload di conferma pagina carriere", () => {
      const validPayload = {
        url: "https://www.acmecorp.com/careers",
        motivazione: "Pagina ufficiale con l'elenco delle posizioni aperte.",
      };
      expect(() => confermaPaginaCarriereSchema.parse(validPayload)).not.toThrow();
    });

    it("deve validare il payload di segnalazione pagina inesistente", () => {
      const validPayload = {
        motivo: "L'azienda dichiara esplicitamente di non avere posizioni aperte sul sito ufficiale.",
      };
      expect(() => segnalaPaginaInesistenteSchema.parse(validPayload)).not.toThrow();
    });

    it("deve validare il payload di segnalazione ricerca non conclusiva", () => {
      const validPayload = {
        motivo: "Nessun sito ufficiale riscontrato nei risultati di ricerca.",
      };
      expect(() => segnalaRicercaNonConclusivaSchema.parse(validPayload)).not.toThrow();
    });

    it("tutti gli scenari devono avere azioni terminali dichiarate nel manifesto", () => {
      const terminalActionIds = careerAgentManifest.A_term.map((a) => a.id);
      for (const scenario of CAREER_SCENARIOS) {
        expect(terminalActionIds).toContain(scenario.azioneTerminaleAttesa);
      }
    });

    it("LiveWebWorldClient deve definire i tool fisici corretti nel registro del mondo", () => {
      const liveWorld = createLiveCareerWorld();
      expect(liveWorld.getToolDefinition("w_cerca_web")).toBeDefined();
      expect(liveWorld.getToolDefinition("w_leggi_pagina_web")).toBeDefined();
    });
  });
});
