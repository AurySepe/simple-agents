import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';

export interface MarkdownProjectorOptions {
  customHeader?: string;
  /**
   * Whether to include the explicit 'OPERATING PROTOCOL' section in the system frame.
   * Clarifies to the model the formal distinction between world actions and termination actions,
   * and prohibits conversational free text in chat.
   * Default: true.
   */
  includeOperatingProtocol?: boolean;
  /**
   * Custom text for the operating protocol, replacing the default protocol text.
   */
  customProtocolText?: string;
}

const DEFAULT_PROTOCOL_TEXT = `- World Actions: Used to interact with the external environment (e.g. querying databases or executing changes).
- Termination Actions: Must be invoked when deciding to terminate execution (whether the goal is achieved, or in case of unrecoverable errors, inability to proceed, or need for intervention). The rationale and semantics of the closure depend on the specific termination action chosen.
- No Free-Text Output: Never communicate via conversational free text in chat; every decision, final output, or halt state must be formalized by invoking the appropriate action.`;

/**
 * Creates a system frame projector in GitHub-Flavored Markdown.
 * Purely projects <I, Ms, Ds, Ka> into the system channel.
 */
export function createMarkdownProjector(options?: MarkdownProjectorOptions): SystemFrameProjector {
  return {
    renderFrame(state: AgentState): string {
      const sections: string[] = [];

      if (options?.customHeader) {
        sections.push(options.customHeader);
      }

      // 1. Agent Identity (I)
      sections.push(`# IDENTITY\n${state.I}`);

      // 2. Operational Mission (Ms)
      sections.push(`## MISSION\n${state.Ms}`);

      // 3. Operating Protocol (if enabled, default: true)
      if (options?.includeOperatingProtocol !== false) {
        const protocolText = options?.customProtocolText ?? DEFAULT_PROTOCOL_TEXT;
        sections.push(`## OPERATING PROTOCOL\n${protocolText}`);
      }

      // 4. Structured Operational Data (Ds)
      if (Object.keys(state.Ds).length > 0) {
        sections.push(`## STRUCTURED OPERATIONAL DATA\n\`\`\`json\n${JSON.stringify(state.Ds, null, 2)}\n\`\`\``);
      }

      // 5. Active Knowledge & Concepts (Ka)
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
