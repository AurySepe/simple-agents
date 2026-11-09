import { imageDescriberContract } from './contract.js';

/**
 * ============================================================================
 * BINDING ESECUTIVO DELL'AGENTE (Livello 3)
 * ============================================================================
 * Poiché l'agente non necessita di tool fisici (mondo W vuoto),
 * l'implementazione si limita a collegare il contratto cognitivo.
 */
export const imageDescriberAgent = imageDescriberContract.implement({
  tools: {}
});
