import { SystemFrameProjector } from '../../engine/projection.js';
import {
  createMarkdownProjector,
  ProjectorLanguage
} from './markdown-projector.js';
import { createXmlProjector } from './xml-projector.js';

export type ProjectorFormat = 'markdown' | 'xml';

export interface FrameProjectorOptions {
  format?: ProjectorFormat;
  language?: ProjectorLanguage;
  customHeader?: string;
}

/**
 * Factory unificata per la generazione di SystemFrameProjector.
 * Consente di configurare congiuntamente il formato ('markdown' | 'xml')
 * e la lingua delle etichette/tag ('it' | 'en').
 */
export function createFrameProjector(options?: FrameProjectorOptions): SystemFrameProjector {
  const format = options?.format ?? 'markdown';
  const language = options?.language ?? 'it';

  if (format === 'xml') {
    return createXmlProjector({
      language,
      customHeader: options?.customHeader
    });
  }

  return createMarkdownProjector({
    language,
    customHeader: options?.customHeader
  });
}

