import { searchCompanyCareers } from "./runner.js";

/**
 * ============================================================================
 * ENTRYPOINT DI ESECUZIONE: RICERCA CARRIERE AZIENDALI
 * ============================================================================
 * Uso:
 *   npx tsx examples/career-agent/index.ts "<nome_azienda>" "[descrizione_opzionale]"
 *
 * Esempio:
 *   npx tsx examples/career-agent/index.ts "Bending Spoons" "Azienda di app mobile con sede a Milano"
 */
async function main() {
  // Lettura argomenti da riga di comando o valore predefinito
  const args = process.argv.slice(2);
  const companyName = args[0] || "Bending Spoons";
  const companyDescription = args[1] || "Azienda tecnologica europea con sede principale a Milano";

  console.log("=".repeat(70));
  console.log("   AGENTE INVESTIGATORE PAGINA CARRIERE WEB");
  console.log(`   Azienda Target:     "${companyName}"`);
  console.log(`   Descrizione:        "${companyDescription}"`);
  console.log("=".repeat(70));
  console.log("\nAvvio dell'investigazione web...\n");

  const outcome = await searchCompanyCareers({
    name: companyName,
    description: companyDescription,
  });

  console.log("\n" + "=".repeat(70));
  if (!outcome.ok) {
    console.log("   ❌ ESECUZIONE FALLITA PER ERRORE INFRASTRUTTURALE");
    console.log("=".repeat(70));
    switch (outcome.error.kind) {
      case "TOOL_ERROR":
        console.log(`Tool fallito:    ${outcome.error.toolName}`);
        console.log(`Tipo errore:     ${outcome.error.error.type}`);
        console.log(`Dettaglio:       ${outcome.error.message}`);
        break;
      case "MODEL_ERROR":
        console.log(`Modello fallito: ${outcome.error.error.type}`);
        console.log(`Dettaglio:       ${outcome.error.message}`);
        break;
      case "QUIESCENCE_VIOLATION":
        console.log(`Violazione:      Quiescenza violata in stato ${outcome.error.currentState}`);
        console.log(`Dettaglio:       ${outcome.error.message}`);
        break;
    }
    console.log(`Stato intatto preservato in q_yield/checkpoint.`);
    console.log("=".repeat(70));
    return;
  }

  // Qui TypeScript sa al 100% che outcome.ok === true
  switch (outcome.status) {
    case "halt": {
      switch (outcome.result.type) {
        case "conferma_pagina_carriere": {
          console.log("   ESITO: PAGINA CARRIERE TROVATA E CONFERMATA!");
          console.log("=".repeat(70));
          console.log(`URL Ufficiale:  ${outcome.result.payload.url}`);
          console.log(`Motivazione:    ${outcome.result.payload.motivazione}`);
          break;
        }
        case "segnala_pagina_inesistente": {
          console.log("   ESITO: NESSUNA POSIZIONE APERTA SUL SITO UFFICIALE");
          console.log("=".repeat(70));
          console.log(`Dettaglio:      ${outcome.result.payload.motivo}`);
          break;
        }
        case "segnala_ricerca_non_conclusiva": {
          console.log("   ESITO: RICERCA NON CONCLUSIVA");
          console.log("=".repeat(70));
          console.log(`Motivo:         ${outcome.result.payload.motivo}`);
          break;
        }
      }
      console.log(`Macro-cicli:    ${outcome.macroCycles} | Micro-tick: ${outcome.ticks}`);
      break;
    }

    case "stall": {
      console.log("   ⚠️ ESECUZIONE TERMINATA IN STALLO");
      console.log("=".repeat(70));
      console.log(`Motivo:         ${outcome.stall.reason}`);
      console.log(`Dettaglio:      ${outcome.stall.message}`);
      break;
    }

    case "suspended": {
      console.log("   ⏸️ ESECUZIONE SOSPESA");
      console.log("=".repeat(70));
      console.log(`Motivo:         ${outcome.reason}`);
      break;
    }
  }
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("\n❌ Errore fatale durante l'esecuzione:", err);
  process.exit(1);
});

