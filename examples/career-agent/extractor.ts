import * as cheerio from "cheerio";
import type { ExtractedWebPage, WebLink } from "./types.js";

const RELEVANT_KEYWORDS = [
  "career",
  "careers",
  "job",
  "jobs",
  "lavora",
  "lavora con noi",
  "lavorare in",
  "posizioni",
  "position",
  "positions",
  "hiring",
  "join",
  "work with us",
  "work at",
  "openings",
  "opportunità",
  "recruiting",
  "search",
  "cerca",
  "trova",
  "greenhouse",
  "lever",
  "workday",
  "ashby",
  "ashbyhq",
  "bamboohr",
  "smartrecruiters",
];

const JUNK_LINK_PATTERNS = [
  /sign[\s_-]?out/i,
  /log[\s_-]?out/i,
  /sign[\s_-]?in/i,
  /log[\s_-]?in/i,
  /account/i,
  /profile/i,
  /password/i,
  /privacy/i,
  /cookie/i,
  /terms/i,
  /impressum/i,
  /disclaimer/i,
  /facebook\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /instagram\.com/i,
  /linkedin\.com/i,
  /youtube\.com/i,
  /apple\.com/i,
  /google\.com\/store/i,
  /bit\.ly/i,
];

/**
 * Calcola il punteggio di rilevanza di un link per posizionare in cima
 * le pagine di ricerca e le liste concrete di posizioni aperte.
 */
function scoreLink(text: string, url: string): number {
  const combined = `${text} ${url}`.toLowerCase();
  let score = 0;

  // Massima priorità: ricerca attiva o elenchi concreti di ruoli/posizioni
  if (/search|cerca|trova|openings|jobsearch|find[-_]jobs|view[-_]jobs|all[-_]jobs|posizioni/i.test(combined)) {
    score += 15;
  }
  // Alta priorità: portali carriere, application o offerte dirette
  if (/career|careers|lavora|opportunit|apply|hiring/i.test(combined)) {
    score += 10;
  }
  // ATS e piattaforme di assunzione note
  if (
    /greenhouse\.io|lever\.co|myworkdayjobs\.com|ashbyhq\.com|bamboohr\.com|smartrecruiters\.com|taleo\.net/i.test(
      combined
    )
  ) {
    score += 12;
  }
  // Media priorità: parola chiave job generica
  if (/jobs?/i.test(combined)) {
    score += 5;
  }

  return score;
}

/**
 * Pulisce ed estrae le informazioni rilevanti da un documento HTML usando Cheerio.
 * - Preserva header, footer e componenti di ricerca per identificare i percorsi verso le posizioni aperte
 * - Rimuove script, stili, codici, svg, immagini per ridurre il rumore e token non testuali
 * - Cattura azioni di ricerca da form HTML (<form action="...">) e proprietà interattive
 * - Classifica e ordina i link per rilevanza semantica dando precedenza alla consultazione dei lavori
 */
export function extractWebPage(html: string, baseUrl: string, maxSummaryChars: number = 5000): ExtractedWebPage {
  const $ = cheerio.load(html);

  const extractedJobs: Array<{ title: string; url: string }> = [];

  // 0. Estrai posizioni strutturate da JSON-LD (Schema.org JobPosting) prima di rimuovere gli script
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const item of items) {
        if (item && item["@type"] === "JobPosting" && item.title) {
          extractedJobs.push({
            title: String(item.title).trim(),
            url: item.url ? String(item.url) : baseUrl,
          });
        }
      }
    } catch {}
  });

  // 1. Estrai posizioni strutturate da attributi di idratazione SPA (Vue, Homerun, React, Nuxt)
  $("[v-bind], [data-job-list], [data-jobs], [data-vacancies], [data-positions]").each((_, el) => {
    const raw =
      $(el).attr("v-bind") ||
      $(el).attr("data-job-list") ||
      $(el).attr("data-jobs") ||
      $(el).attr("data-vacancies") ||
      $(el).attr("data-positions");
    if (!raw) return;
    try {
      const cleanRaw = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const data = JSON.parse(cleanRaw);
      const list = data?.content?.vacancies || data?.vacancies || data?.jobs || [];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.title) {
            extractedJobs.push({
              title: String(item.title).trim(),
              url: item.url ? String(item.url) : baseUrl,
            });
          }
        }
      }
    } catch {}
  });

  // Rimuovi elementi rumorosi o tecnici inutili per il modello
  $("script, style, noscript, svg, img, iframe, video, audio, code, pre, template").remove();

  // Estrai titolo
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    baseUrl;

  const linksMap = new Map<string, { text: string; url: string; score: number }>();

  // Registra con massima priorità le posizioni lavorative estratte dai metadati e hydration
  for (const job of extractedJobs) {
    try {
      const fullUrl = new URL(job.url, baseUrl).href;
      linksMap.set(fullUrl, {
        text: job.title,
        url: fullUrl,
        score: 25,
      });
    } catch {}
  }

  // 2. Estrai endpoint di ricerca da moduli <form action="...">
  $("form[action]").each((_, el) => {
    const action = $(el).attr("action");
    if (!action || action.startsWith("#") || action.startsWith("javascript:")) return;

    try {
      const formUrl = new URL(action, baseUrl).href;
      if (!JUNK_LINK_PATTERNS.some((p) => p.test(formUrl))) {
        const formBtn = $(el).find('button, input[type="submit"]').text().trim();
        const formText = formBtn ? `Cerca lavoro (${formBtn})` : "Cerca lavoro / Ricerca posizioni aperte";
        linksMap.set(formUrl, {
          text: formText,
          url: formUrl,
          score: 16,
        });
      }
    } catch {}
  });

  // 2. Estrai azioni interattive da attributi dati (es. React data-react-props di portali moderni come Amazon)
  $("[data-react-props]").each((_, el) => {
    const props = $(el).attr("data-react-props") || "";

    const actionMatch = props.match(/"action"\s*:\s*"([^"]+)"/);
    if (actionMatch && actionMatch[1]) {
      try {
        const actionUrl = new URL(actionMatch[1], baseUrl).href;
        if (!JUNK_LINK_PATTERNS.some((p) => p.test(actionUrl))) {
          linksMap.set(actionUrl, {
            text: "Cerca offerte di lavoro (Ricerca posizioni)",
            url: actionUrl,
            score: 16,
          });
        }
      } catch {}
    }

    const btnMatch = props.match(/"button_link"\s*:\s*"(https?:\/\/[^"]+)"/);
    if (btnMatch && btnMatch[1]) {
      try {
        const btnUrl = btnMatch[1];
        if (!JUNK_LINK_PATTERNS.some((p) => p.test(btnUrl))) {
          linksMap.set(btnUrl, {
            text: "Opportunità di lavoro (Offerte)",
            url: btnUrl,
            score: 14,
          });
        }
      } catch {}
    }
  });

  // 3. Raccogli e filtra i link classici <a>
  $("a").each((_, el) => {
    const rawHref = $(el).attr("href");
    const linkText = $(el).text().replace(/\s+/g, " ").trim();

    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
      return;
    }

    if (JUNK_LINK_PATTERNS.some((p) => p.test(rawHref) || p.test(linkText))) {
      return;
    }

    try {
      const urlObj = new URL(rawHref, baseUrl);
      // Rimuovi parametri di tracciamento e marketing
      const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"];
      for (const p of trackingParams) {
        urlObj.searchParams.delete(p);
      }

      const absoluteUrl = urlObj.href;
      const combinedSearchable = `${linkText} ${rawHref} ${urlObj.pathname}`.toLowerCase();

      const isRelevant = RELEVANT_KEYWORDS.some((kw) =>
        combinedSearchable.includes(kw)
      );

      if (isRelevant && linkText.length > 0 && linkText.length < 90) {
        const normalizedKey = `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, "");
        const score = scoreLink(linkText, absoluteUrl);

        const existing = linksMap.get(normalizedKey);
        if (!existing || score > existing.score) {
          const cleanUrl = urlObj.searchParams.size === 0 ? normalizedKey : absoluteUrl;
          linksMap.set(normalizedKey, { text: linkText, url: cleanUrl, score });
        }
      }
    } catch {
      // Ignora URL malformati
    }
  });

  // Ordina i link per punteggio di rilevanza decrescente e prendi i migliori 10
  const relevantLinks: WebLink[] = Array.from(linksMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => ({ text: item.text, url: item.url }));

  // Estrai testo pulito del corpo (main, body)
  const bodyText = $("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  // Tronca il testo a un massimo di caratteri (default 5000) per non saturare la finestra di contesto
  let summary =
    bodyText.length > maxSummaryChars ? bodyText.slice(0, maxSummaryChars) + " [...]" : bodyText;

  // Se sono state estratte posizioni concrete dai metadati/hydration della pagina, esponile chiaramente in cima
  if (extractedJobs.length > 0) {
    const jobsListText = extractedJobs
      .slice(0, 5)
      .map((j) => `• ${j.title} (${j.url})`)
      .join("\n");
    summary = `[POSIZIONI LAVORATIVE APERTE RILEVATE NELLA PAGINA]:\n${jobsListText}\n\n[INFORMAZIONI GENERALI]:\n${summary}`;
  }

  return {
    url: baseUrl,
    title,
    summary,
    relevantLinks,
  };
}
