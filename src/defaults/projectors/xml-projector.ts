import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';

/**
 * Proiettore di stato in formato XML / Semantic Tags.
 * Proietta puramente <I, Ms, Ds, Ka> nel canale system.
 */
export const defaultXmlProjector: SystemFrameProjector = {
  renderFrame(state: AgentState): string {
    const parts: string[] = [];

    parts.push(`<identity>\n${state.I}\n</identity>`);
    parts.push(`<mission>\n${state.Ms}\n</mission>`);

    if (Object.keys(state.Ds).length > 0) {
      parts.push(`<structured_data>\n${JSON.stringify(state.Ds, null, 2)}\n</structured_data>`);
    }

    if (state.Ka.size > 0) {
      const conceptsXml = Array.from(state.Ka.values())
        .map((c) => `  <concept id="${c.id}" description="${c.descrizione}">\n    ${c.corpo}\n  </concept>`)
        .join('\n');
      parts.push(`<active_concepts>\n${conceptsXml}\n</active_concepts>`);
    }

    return parts.join('\n\n');
  }
};
