import * as fs from "fs";
import * as path from "path";
import { runLiveCareerAgent } from "./live-runner.js";

interface CompanyTest {
  azienda: string;
  descrizione: string;
}

const COMPANIES: CompanyTest[] = [
  { azienda: "Microsoft", descrizione: "Sistemi operativi, cloud Azure, produttività e AI" },
  { azienda: "Google", descrizione: "Motori di ricerca, cloud computing, sistemi Android e AI" },
  { azienda: "Apple", descrizione: "Sistemi operativi, hardware, software e servizi digitali" },
  { azienda: "Amazon", descrizione: "E-commerce, logistica e cloud computing AWS" },
  { azienda: "NVIDIA", descrizione: "Calcolo accelerato, GPU, AI e piattaforme CUDA" },
  { azienda: "Meta", descrizione: "Piattaforme social, software open-source e intelligenza artificiale" },
  { azienda: "Oracle", descrizione: "Database enterprise, software aziendale ERP e cloud infrastructure" },
  { azienda: "SAP", descrizione: "Software gestionale aziendale ed ERP per grandi imprese" },
  { azienda: "Salesforce", descrizione: "Software CRM in cloud ed enterprise business software" },
  { azienda: "Stripe", descrizione: "Infrastruttura di pagamento globale e API fintech" },
];

interface TestReportItem {
  azienda: string;
  status: "SUCCESS" | "STALL" | "ERROR";
  azioneScelta?: string;
  urlTrovato?: string;
  motivazione?: string;
  macroCicli: number;
  ticks: number;
  durataSecondi: number;
  errore?: string;
}

async function runBatch() {
  console.log("=".repeat(80));
  console.log("   AVVIO BATCH TEST SU 10 SOCIETÀ INFORMATICHE GLOBALI");
  console.log("=".repeat(80));

  const report: TestReportItem[] = [];

  for (let i = 0; i < COMPANIES.length; i++) {
    const item = COMPANIES[i];
    console.log(`\n[${ i + 1 }/10] Test in corso su: ${item.azienda}...`);
    const start = Date.now();

    try {
      const outcome = await runLiveCareerAgent({
        azienda: item.azienda,
        descrizione: item.descrizione,
      });

      const durationSec = Math.round((Date.now() - start) / 1000);

      switch (outcome.status) {
        case "halt": {
          const payload = outcome.result.payload as Record<string, unknown>;
          report.push({
            azienda: item.azienda,
            status: "SUCCESS",
            azioneScelta: outcome.result.type,
            urlTrovato: (payload?.url as string) ?? undefined,
            motivazione: (payload?.motivazione as string) ?? (payload?.motivo as string) ?? undefined,
            macroCicli: outcome.macroCycles,
            ticks: outcome.ticks,
            durataSecondi: durationSec,
          });
          console.log(`✅ [${item.azienda}] Completato con ${outcome.result.type} in ${durationSec}s`);
          break;
        }
        case "stall": {
          report.push({
            azienda: item.azienda,
            status: "STALL",
            azioneScelta: "q_stall",
            motivazione: outcome.stall.reason,
            macroCicli: outcome.macroCycles,
            ticks: outcome.ticks,
            durataSecondi: durationSec,
          });
          console.log(`⚠️ [${item.azienda}] Stallo cognitivo: ${outcome.stall.reason} in ${durationSec}s`);
          break;
        }
      }
    } catch (err: unknown) {
      const durationSec = Math.round((Date.now() - start) / 1000);
      const errMsg = err instanceof Error ? err.message : String(err);
      report.push({
        azienda: item.azienda,
        status: "ERROR",
        macroCicli: 0,
        ticks: 0,
        durataSecondi: durationSec,
        errore: errMsg,
      });
      console.error(`❌ [${item.azienda}] Errore: ${errMsg}`);
    }
  }

  const reportFile = path.resolve("examples/career-agent/batch-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n" + "=".repeat(80));
  console.log("   REPORT FINALE DEL BATCH TEST");
  console.log("=".repeat(80));
  console.table(
    report.map((r) => ({
      Azienda: r.azienda,
      Esito: r.status,
      Azione: r.azioneScelta ?? "N/A",
      URL: r.urlTrovato ? (r.urlTrovato.length > 45 ? r.urlTrovato.slice(0, 42) + "..." : r.urlTrovato) : "N/A",
      Durata: `${r.durataSecondi}s`,
      Cicli: r.macroCicli,
    }))
  );
}

runBatch().catch(console.error);

