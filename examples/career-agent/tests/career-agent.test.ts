import { describe, expect, it } from "vitest";
import { extractWebPage } from "../extractor.js";
import {
  careerAgentContract,
  confermaPaginaCarriereSchema,
  segnalaPaginaInesistenteSchema,
  segnalaRicercaNonConclusivaSchema,
} from "../contract.js";
import { careerAgent, RealWebClient } from "../implementation.js";
import { careerRunner } from "../runner.js";

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

  describe("Contratto Cognitivo Puro (contract.ts)", () => {
    it("deve dichiarare l'identità e la missione dell'agente", () => {
      expect(careerAgentContract.contract.identity).toContain("Agente Investigatore Web");
      expect(careerAgentContract.contract.mission).toContain("offerte di lavoro");
    });

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
  });

  describe("Implementazione Reale e Binding (implementation.ts)", () => {
    it("deve istanziare il RealWebClient con i timeout corretti", () => {
      const client = new RealWebClient({ timeoutMs: 5000 });
      expect(client).toBeInstanceOf(RealWebClient);
    });

    it("l'agente implementato deve avere i tool w_cerca_web e w_leggi_pagina_web nel Mondo", () => {
      expect(careerAgent.world.getToolDefinition("w_cerca_web")).toBeDefined();
      expect(careerAgent.world.getToolDefinition("w_leggi_pagina_web")).toBeDefined();
    });

    it("il manifesto generato dall'agente implementato deve avere i contratti di terminazione registrati", () => {
      const termIds = careerAgent.manifest.A_term.map((t) => t.id);
      expect(termIds).toContain("conferma_pagina_carriere");
      expect(termIds).toContain("segnala_pagina_inesistente");
      expect(termIds).toContain("segnala_ricerca_non_conclusiva");
    });
  });

  describe("Runner e Stack Esecutivo (runner.ts)", () => {
    it("il runner deve essere pre-configurato e pronto all'uso", () => {
      expect(careerRunner).toBeDefined();
      expect(typeof careerRunner.run).toBe("function");
    });
  });
});
