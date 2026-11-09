import { runTouristGuide } from './runner.js';

async function main() {
  const args = process.argv.slice(2);
  const imageTarget = args[0];
  const customPrompt = args[1];

  if (!imageTarget) {
    console.error('❌ Errore: Percorso o URL dell\'immagine obbligatorio.');
    console.error('Uso: npx tsx examples/tourist-guide/index.ts <percorso_immagine_o_url> [prompt]');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('   AGENTE GUIDA TURISTICA VISUALE (3 MONUMENTI)');
  console.log(`   Target:    ${imageTarget}`);
  if (customPrompt) {
    console.log(`   Prompt:    "${customPrompt}"`);
  }
  console.log('='.repeat(70));
  console.log('\nAvvio elaborazione visiva e decisionale...\n');

  try {
    const outcome = await runTouristGuide({
      imagePathOrUrl: imageTarget,
      prompt: customPrompt
    });

    console.log('\n' + '='.repeat(70));
    if (outcome.status === 'halt') {
      const termType = outcome.result.type;
      const payload = outcome.result.payload as any;

      if (termType === 'concludi_guida') {
        console.log('   ESITO: GUIDA TURISTICA COMPLETATA CON SUCCESSO 🏛️');
        console.log('='.repeat(70));
        console.log(`\n📍 Monumento: ${payload.monumento} (${payload.citta})`);
        console.log(`\n👁️  Descrizione Visiva:\n${payload.descrizione_visiva}`);
        console.log(`\n🕒 Orari di Apertura:\n${payload.orari}`);
        console.log(`\n🎟️  Biglietti:\n${payload.prezzo}`);
        console.log(`\n☀️  Meteo e Consigli Pratici:\n${payload.meteo_e_consigli}`);
      } else if (termType === 'guida_non_disponibile') {
        console.log('   ESITO: GUIDA NON DISPONIBILE ⚠️');
        console.log('='.repeat(70));
        console.log(`\n🚫 Motivo:\n${payload.motivo}`);
        console.log(`\n🙏 Messaggio di Scuse:\n${payload.messaggio_scuse}`);
        if (payload.soggetto_rilevato) {
          console.log(`\n🔍 Soggetto Rilevato:\n${payload.soggetto_rilevato}`);
        }
      } else {
        console.log(`   ESITO TERMINALE SCONOSCIUTO: ${termType}`);
        console.log(JSON.stringify(payload, null, 2));
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
