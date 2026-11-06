import { FrameworkConfig, OrchestratorPolicy } from '../engine/orchestrator.js';
import { SystemFrameProjector } from '../engine/projection.js';
import { CognitiveToolkit } from '../types/index.js';
import { createDefaultCognitiveToolkit } from './cognitive/index.js';
import { defaultItalianPolicy } from './policies/italian-policy.js';
import { defaultMarkdownProjector } from './projectors/markdown-projector.js';

export * from './cognitive/index.js';
export * from './projectors/index.js';
export * from './policies/index.js';

/**
 * Opzioni di configurazione per la generazione del FrameworkConfig di default.
 */
export interface DefaultFrameworkConfigOptions {
  cognitiveToolkitOverrides?: Partial<CognitiveToolkit>;
  projector?: SystemFrameProjector;
  policy?: OrchestratorPolicy;
  awarenessPrompt?: string;
}

/**
 * Assembla una configurazione completa di Livello 1 pronta all'uso.
 * Per impostazione predefinita utilizza:
 * - CognitiveToolkit in-memory (tutte le 10 primitive canoniche)
 * - Proiettore GitHub-Flavored Markdown (con consapevolezza del protocollo a due fasi)
 * - Policy linguistica italiana
 */
export function createDefaultFrameworkConfig(
  options?: DefaultFrameworkConfigOptions
): FrameworkConfig {
  let policy = options?.policy ?? defaultItalianPolicy;
  if (options?.awarenessPrompt) {
    policy = {
      ...policy,
      systemAwarenessPrompt: options.awarenessPrompt
    };
  }
  return {
    cognitiveTools: createDefaultCognitiveToolkit({
      overrides: options?.cognitiveToolkitOverrides,
      validationMessages: policy.validationMessages,
      metadata: policy.cognitiveMetadata
    }),
    systemFrameProjector: options?.projector ?? defaultMarkdownProjector,
    policy
  };
}
