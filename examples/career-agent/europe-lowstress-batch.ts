import * as fs from "fs";
import * as path from "path";
import { runLiveCareerAgent } from "./live-runner.js";

export interface CompanyCandidate {
  azienda: string;
  descrizione: string;
  headquarters: string;
  cultura: string;
}

export const LOW_STRESS_EUROPEAN_COMPANIES: CompanyCandidate[] = [
  {
    azienda: "37signals",
    descrizione: "Sviluppo software di produttività e collaborazione Basecamp e HEY",
    headquarters: "Presenza remota diffusa / Hub europei",
    cultura: "Pionieri dell'async, settimana da 4 giorni estiva, manifesto 'It Doesn't Have to Be Crazy at Work'",
  },
  {
    azienda: "Buffer",
    descrizione: "Software SaaS per gestione social media e pianificazione contenuti",
    headquarters: "Remoto / Hub Europa",
    cultura: "Settimana lavorativa di 4 giorni (32h), massima trasparenza salariale e forte equilibrio vita-lavoro",
  },
  {
    azienda: "DuckDuckGo",
    descrizione: "Motore di ricerca incentrato sulla privacy e browser web multipiattaforma",
    headquarters: "Remoto / Sedi e assunzioni in Europa",
    cultura: "Filosofia async-first, orari flessibili senza tracciamento invasivo, cultura anti-burnout",
  },
  {
    azienda: "GitLab",
    descrizione: "Piattaforma software DevSecOps integrata per sviluppatori",
    headquarters: "All-Remote (Entità registrate in Germania, UK, Olanda, ecc.)",
    cultura: "Pionieri del lavoro asincrono con handbook pubblico, grande autonomia e flessibilità oraria",
  },
  {
    azienda: "Doist",
    descrizione: "Software di gestione attività e comunicazione asincrona Todoist e Twist",
    headquarters: "Radici a Barcellona e Porto / 100% Remote in Europa",
    cultura: "100% asincrono, assenza totale di riunioni superflue, crescita sostenibile e no-crunch",
  },
  {
    azienda: "Balsamiq",
    descrizione: "Software di wireframing rapido per designer e product manager",
    headquarters: "Bologna (Italia) / Team distribuito in Europa",
    cultura: "Filosofia Kaizen, crescita controllata, profit sharing, nessun crunch e forte rispetto dei ritmi umani",
  },
  {
    azienda: "Ghost",
    descrizione: "Piattaforma CMS e newsletter open-source per editori e creator",
    headquarters: "Remoto (Fondazione non-profit / UK ed Europa)",
    cultura: "Settimana lavorativa di 4 giorni, organizzazione non-profit senza pressioni da investitori VC",
  },
  {
    azienda: "Automattic",
    descrizione: "Software open-source per il web (WordPress.com, Tumblr, Day One)",
    headquarters: "100% Distribuito globale con forte presenza europea",
    cultura: "Lavoro asincrono, totale libertà geografica e oraria, focus sui risultati e non sulle ore trascorse",
  },
  {
    azienda: "Spotify",
    descrizione: "Piattaforma di streaming musicale, podcast e software audio digitale",
    headquarters: "Stoccolma (Svezia) con hub a Londra e Berlino",
    cultura: "Modello scandinavo: congedi parentali generosi, politica 'Work from Anywhere', alto work-life balance",
  },
  {
    azienda: "Personio",
    descrizione: "Software HR e gestione del personale all-in-one per PMI",
    headquarters: "Monaco di Baviera (Germania) con hub a Madrid e Dublino",
    cultura: "Approccio europeo al benessere aziendale, policy ibride moderne, forte enfasi sulla salute psicologica",
  },
  {
    azienda: "Klarna",
    descrizione: "Piattaforma software di pagamenti digitali, shopping online e banking",
    headquarters: "Stoccolma (Svezia)",
    cultura: "Standard lavorativi svedesi con welfare avanzato, orari ragionevoli e approccio orientato al prodotto",
  },
  {
    azienda: "Miro",
    descrizione: "Piattaforma di lavagna visiva collaborativa per team di innovazione",
    headquarters: "Amsterdam (Paesi Bassi) con hub europei a Berlino e Londra",
    cultura: "Cultura olandese moderna, orari bilanciati, smart working diffuso e comunicazione asincrona",
  },
  {
    azienda: "Zendesk",
    descrizione: "Piattaforma SaaS di customer support e CRM relazionale",
    headquarters: "Hub di sviluppo a Dublino (Irlanda) e Montpellier (Francia)",
    cultura: "Notoriamente ai vertici delle classifiche Glassdoor per work-life balance e benefit per i dipendenti",
  },
  {
    azienda: "Bird",
    descrizione: "Piattaforma software di comunicazione e API omnicanale (ex MessageBird)",
    headquarters: "Amsterdam (Paesi Bassi)",
    cultura: "Cultura tech olandese aperta, flat hierarchy e flessibilità di lavoro ibrido",
  },
  {
    azienda: "Contentful",
    descrizione: "Piattaforma CMS headless e content infrastructure componibile",
    headquarters: "Berlino (Germania)",
    cultura: "Orari flessibili, benefit per la salute mentale, ambiente inclusivo e rispetto delle ferie tedesche",
  },
  {
    azienda: "Sketch",
    descrizione: "Strumento di design vettoriale e UI/UX per Mac e browser",
    headquarters: "L'Aia (Paesi Bassi) / 100% Remote europeo",
    cultura: "Nata da subito 100% da remoto, organizzazione calma (calm company), zero micro-management",
  },
  {
    azienda: "Teamwork",
    descrizione: "Software SaaS di project management e operations per agenzie e team",
    headquarters: "Cork (Irlanda)",
    cultura: "Forte cultura comunitaria irlandese, enfasi sull'equilibrio personale e modello ibrido/remoto",
  },
  {
    azienda: "Aha!",
    descrizione: "Piattaforma software di product roadmap e strategia per team di sviluppo",
    headquarters: "100% Remote (assunzioni attive in UK ed Europa)",
    cultura: "Bootstrapped senza VC, policy esplicita contro gli straordinari inutili, focus sulla serenità",
  },
  {
    azienda: "Hotjar",
    descrizione: "Software di analisi del comportamento utenti, mappe di calore e feedback",
    headquarters: "Malta / 100% Remote EMEA",
    cultura: "40 giorni di ferie retribuite all'anno, budget salute e benessere, policy ferrea anti-burnout",
  },
  {
    azienda: "Toggl",
    descrizione: "Software di monitoraggio del tempo, pianificazione progetti e hiring",
    headquarters: "Tallinn (Estonia) / 100% Remote europeo",
    cultura: "Team distribuito asincrono, totale autonomia di orario e valorizzazione della produttività sostenibile",
  },
];

export interface ExecutionReportItem {
  index: number;
  azienda: string;
  descrizione: string;
  headquarters: string;
  cultura: string;
  status: "SUCCESS" | "STALL" | "ERROR";
  azioneScelta?: string;
  urlTrovato?: string;
  motivazione?: string;
  macroCicli: number;
  ticks: number;
  durataSecondi: number;
  errore?: string;
}

async function main() {
  const outputFile = path.resolve("examples/career-agent/europe-lowstress-results.json");
  const report: ExecutionReportItem[] = [];

  console.log("=".repeat(85));
  console.log("   BENCHMARK CARRIERE SU 20 AZIENDE SOFTWARE DI PRODOTTO EUROPEE A BASSO STRESS");
  console.log("=".repeat(85));

  for (let i = 0; i < LOW_STRESS_EUROPEAN_COMPANIES.length; i++) {
    const target = LOW_STRESS_EUROPEAN_COMPANIES[i];
    console.log(`\n▶ [${i + 1}/${LOW_STRESS_EUROPEAN_COMPANIES.length}] Esecuzione agente per: "${target.azienda}"...`);
    console.log(`  Sede: ${target.headquarters}`);
    console.log(`  Cultura: ${target.cultura}`);

    const maxRetries = 3;
    let attempt = 0;
    let completed = false;

    while (attempt < maxRetries && !completed) {
      attempt++;
      const start = Date.now();
      try {
        if (attempt > 1) {
          console.log(`  ↻ Tentativo ${attempt}/${maxRetries} per: "${target.azienda}"...`);
        }

        const outcome = await runLiveCareerAgent({
          azienda: target.azienda,
          descrizione: target.descrizione,
        });

        const durationSec = Math.round((Date.now() - start) / 1000);
        const isHalt = outcome.status === "halt";
        const payload = isHalt
          ? (outcome.result.payload as Record<string, unknown>)
          : (outcome.stall as unknown as Record<string, unknown>);

        const item: ExecutionReportItem = {
          index: i + 1,
          azienda: target.azienda,
          descrizione: target.descrizione,
          headquarters: target.headquarters,
          cultura: target.cultura,
          status: isHalt ? "SUCCESS" : "STALL",
          azioneScelta: isHalt ? outcome.result.type : "q_stall",
          urlTrovato: (payload?.url as string) ?? undefined,
          motivazione: (payload?.motivazione as string) ?? (payload?.motivo as string) ?? (payload?.message as string) ?? undefined,
          macroCicli: outcome.macroCycles,
          ticks: outcome.ticks,
          durataSecondi: durationSec,
        };

        report.push(item);
        fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), "utf-8");

        console.log(`✔ [${target.azienda}] Concluso in ${durationSec}s | Esito: ${item.azioneScelta} | URL: ${item.urlTrovato ?? "N/A"}`);
        completed = true;
      } catch (err: unknown) {
        const durationSec = Math.round((Date.now() - start) / 1000);
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          errMsg.includes("403") ||
          errMsg.includes("Forbidden") ||
          errMsg.includes("DuckDuckGo") ||
          errMsg.includes("rate");

        if (isRateLimit && attempt < maxRetries) {
          const waitSec = 30 * attempt;
          console.warn(`⚠️ [${target.azienda}] Rilevato rate limiting DuckDuckGo. Pausa di raffreddamento (${waitSec}s) prima di riprovare...`);
          await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
        } else {
          const item: ExecutionReportItem = {
            index: i + 1,
            azienda: target.azienda,
            descrizione: target.descrizione,
            headquarters: target.headquarters,
            cultura: target.cultura,
            status: "ERROR",
            macroCicli: 0,
            ticks: 0,
            durataSecondi: durationSec,
            errore: errMsg,
          };

          report.push(item);
          fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), "utf-8");
          console.error(`✖ [${target.azienda}] Fallito dopo ${attempt} tentativi (${durationSec}s): ${errMsg}`);
          completed = true;
        }
      }
    }

    // Pacing preventivo tra aziende successive
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  console.log("\n" + "=".repeat(85));
  console.log("   TUTTI I 20 RUN COMPLETATI CON SUCCESSO!");
  console.log("   Risultati esportati in:", outputFile);
  console.log("=".repeat(85));
}

main().catch((err) => {
  console.error("Errore critico batch:", err);
  process.exit(1);
});

