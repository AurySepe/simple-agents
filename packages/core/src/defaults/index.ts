import { FrameworkConfig } from '../engine/orchestrator.js';
import { defaultOperationalPolicy } from './policies/operational-policy.js';
import { defaultMarkdownProjector } from './projectors/markdown-projector.js';

export * from './policies/index.js';
export * from './projectors/index.js';

export function createDefaultFrameworkConfig(overrides?: FrameworkConfig): FrameworkConfig {
  return {
    systemFrameProjector: defaultMarkdownProjector,
    policy: defaultOperationalPolicy,
    ...overrides
  };
}
