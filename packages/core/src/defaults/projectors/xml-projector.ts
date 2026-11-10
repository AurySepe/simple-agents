import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';

export interface XmlProjectorOptions {
  customHeader?: string;
  /**
   * Whether to include the 'operating_protocol' tag in the XML frame.
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
 * Creates a system frame projector in XML / Semantic Tags format.
 * Purely projects <I, Ms, Ds, Ka> into the system channel.
 */
export function createXmlProjector(options?: XmlProjectorOptions): SystemFrameProjector {
  return {
    renderFrame(state: AgentState): string {
      const parts: string[] = [];

      if (options?.customHeader) {
        parts.push(options.customHeader);
      }

      parts.push(`<identity>\n${state.I}\n</identity>`);
      parts.push(`<mission>\n${state.Ms}\n</mission>`);

      if (options?.includeOperatingProtocol !== false) {
        const protocolText = options?.customProtocolText ?? DEFAULT_PROTOCOL_TEXT;
        parts.push(`<operating_protocol>\n${protocolText}\n</operating_protocol>`);
      }

      if (Object.keys(state.Ds).length > 0) {
        parts.push(`<structured_data>\n${JSON.stringify(state.Ds, null, 2)}\n</structured_data>`);
      }

      if (state.Ka.size > 0) {
        const conceptsXml = Array.from(state.Ka.values())
          .map((c) => `  <concept name="${c.name}" description="${c.descrizione}">\n    ${c.corpo}\n  </concept>`)
          .join('\n');
        parts.push(`<active_concepts>\n${conceptsXml}\n</active_concepts>`);
      }

      return parts.join('\n\n');
    }
  };
}

export const defaultXmlProjector: SystemFrameProjector = createXmlProjector();
