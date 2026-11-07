import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';

export interface MarkdownProjectorOptions {
  customHeader?: string;
}

/**
 * Crea un proiettore di stato in formato GitHub-Flavored Markdown.
 * Proietta puramente <I, Ms, Ds, Ka> nel canale system.
 */
export function createMarkdownProjector(options?: MarkdownProjectorOptions): SystemFrameProjector {
  return {
    renderFrame(state: AgentState): string {
      const sections: string[] = [];

      if (options?.customHeader) {
        sections.push(options.customHeader);
      }

      // 1. Identità dell'Agente (I)
      sections.push(`# IDENTITY\n${state.I}`);

      // 2. Missione Operativa (Ms)
      sections.push(`## MISSION\n${state.Ms}`);

      // 3. Mappa dei Dati Operativi Strutturati (Ds)
      if (Object.keys(state.Ds).length > 0) {
        sections.push(`## STRUCTURED OPERATIONAL DATA\n\`\`\`json\n${JSON.stringify(state.Ds, null, 2)}\n\`\`\``);
      }

      // 4. Conoscenza e Concetti Attivi (Ka)
      if (state.Ka.size > 0) {
        const conceptEntries: string[] = [];
        for (const [id, concept] of state.Ka.entries()) {
          conceptEntries.push(`### [DOCUMENT: ${id}] ${concept.descrizione}\n${concept.corpo}`);
        }
        sections.push(`## ACTIVE KNOWLEDGE\n${conceptEntries.join('\n\n')}`);
      }

      return sections.join('\n\n');
    }
  };
}

export const defaultMarkdownProjector: SystemFrameProjector = createMarkdownProjector();
