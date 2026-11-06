/**
 * ============================================================================
 * ENTRYPOINT DI ESEMPPIO: AGENTE COMMERCIALE LIVE SU OLLAMA
 * ============================================================================
 * Delega l'avvio al modulo modulare in ./live-ollama/runner.ts
 */
import { runCommercialAgent } from './live-ollama/runner.js';

runCommercialAgent().catch((err) => {
  console.error('Fatal execution error:', err);
});
