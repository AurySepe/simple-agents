import { SystemFrameProjector } from '../../engine/projection.js';
import { createMarkdownProjector } from './markdown-projector.js';
import { createXmlProjector } from './xml-projector.js';

export type ProjectorFormat = 'markdown' | 'xml';

export interface FrameProjectorOptions {
  format?: ProjectorFormat;
  customHeader?: string;
}

/**
 * Unified factory for creating SystemFrameProjector.
 * Configures the output format ('markdown' | 'xml').
 */
export function createFrameProjector(options?: FrameProjectorOptions): SystemFrameProjector {
  const format = options?.format ?? 'markdown';

  if (format === 'xml') {
    return createXmlProjector({
      customHeader: options?.customHeader
    });
  }

  return createMarkdownProjector({
    customHeader: options?.customHeader
  });
}
