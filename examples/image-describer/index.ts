import { describeImage } from './runner.js';

/**
 * ============================================================================
 * ENTRYPOINT CLI: DESCRIZIONE DI UN'IMMAGINE TRAMITE AGENTE VISUALE
 * ============================================================================
 * Uso:
 *   npx tsx examples/image-describer/index.ts "<percorso_immagine_o_url>" "[prompt_opzionale]"
 *
 * Esempio:
 *   npx tsx examples/image-describer/index.ts "./foto.jpg"
 *   npx tsx examples/image-describer/index.ts "https://example.com/chart.png" "Trascrivi i dati del grafico"
 */
async function main() {
  const args = process.argv.slice(2);
  const imageTarget = args[0];
  const customPrompt = args[1];

  if (!imageTarget) {
    console.error('❌ Errore: Percorso o URL dell\'immagine obbligatorio.');
    console.error('Uso: npx tsx examples/image-describer/index.ts <percorso_immagine_o_url> [prompt]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('   AGENTE OSSERVATORE VISIVO - ANALISI IMMAGINE');
  console.log(`   Target:    ${imageTarget}`);
  if (customPrompt) {
    console.log(`   Richiesta: "${customPrompt}"`);
  }
  console.log('='.repeat(70));
  console.log('\nAvvio dell\'elaborazione visiva...\n');

  try {
    const outcome = await describeImage({
      imagePathOrUrl: imageTarget,
      prompt: customPrompt
    });

    console.log('\n' + '='.repeat(70));
    if (outcome.status === 'halt') {
      const payload = outcome.result.payload;
      console.log('   ESITO: DESCRIZIONE COMPLETATA');
      console.log('='.repeat(70));
      console.log(`\n📋 Descrizione Generale:\n${payload.descrizione_generale}\n`);

      console.log('🔍 Elementi Chiave Rilevati:');
      for (const elemento of payload.elementi_chiave) {
        console.log(`  • ${elemento}`);
      }

      if (payload.testo_rilevato) {
        console.log(`\n📝 Testo Rilevato:\n${payload.testo_rilevato}`);
      }
    } else {
      console.log(`   ESITO: STALLO O INTERRUZIONE (${outcome.status})`);
      console.log(`Dettaglio: ${outcome.stall?.message}`);
    }
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n❌ Errore durante l\'esecuzione:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

