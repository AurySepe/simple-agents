import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';
import { ProjectorLanguage } from './markdown-projector.js';

export interface XmlProjectorOptions {
  language?: ProjectorLanguage;
  customHeader?: string;
  /**
   * Se includere il tag di 'protocollo_operativo' / 'operating_protocol' nel frame XML.
   * Default: true.
   */
  includeOperatingProtocol?: boolean;
  /**
   * Testo personalizzato per il protocollo operativo, che sostituisce il testo di default.
   */
  customProtocolText?: string;
}

const XML_TAGS = {
  it: {
    identity: 'identita',
    mission: 'missione',
    operatingProtocol: 'protocollo_operativo',
    defaultProtocolText: `- Azioni sul Mondo: Consentono di interagire con l'ambiente esterno (es. interrogare banche dati o eseguire modifiche).
- Azioni di Terminazione: Devono essere invocate quando si decide di terminare la propria esecuzione (sia in caso di completamento dell'obiettivo, sia in caso di impossibilità a procedere, errore irrecuperabile o richiesta di intervento). La motivazione e il significato della chiusura dipendono dalla specifica azione di terminazione selezionata.
- Divieto di testo libero: Non comunicare mai a testo libero nella chat; ogni decisione, esito finale o stato di arresto deve essere formalizzato invocando l'azione appropriata.`,
    structuredData: 'dati_strutturati',
    knowledge: 'concetti_attivi',
    concept: 'concetto',
    descAttr: 'descrizione'
  },
  en: {
    identity: 'identity',
    mission: 'mission',
    operatingProtocol: 'operating_protocol',
    defaultProtocolText: `- World Actions: Used to interact with the external environment (e.g. querying databases or executing changes).
- Termination Actions: Must be invoked when deciding to terminate execution (whether the goal is achieved, or in case of unrecoverable errors, inability to proceed, or need for intervention). The rationale and semantics of the closure depend on the specific termination action chosen.
- No Free-Text Output: Never communicate via conversational free text in chat; every decision, final output, or halt state must be formalized by invoking the appropriate action.`,
    structuredData: 'structured_data',
    knowledge: 'active_concepts',
    concept: 'concept',
    descAttr: 'description'
  }
} as const;

/**
 * Crea un proiettore di stato in formato XML / Semantic Tags.
 * Supporta la localizzazione dei tag ('it' o 'en') e l'inclusione del protocollo operativo.
 * Proietta puramente <I, Ms, Ds, Ka> nel canale system.
 */
export function createXmlProjector(options?: XmlProjectorOptions): SystemFrameProjector {
  const lang = options?.language ?? 'en';
  const tags = XML_TAGS[lang];

  return {
    renderFrame(state: AgentState): string {
      const parts: string[] = [];

      if (options?.customHeader) {
        parts.push(options?.customHeader);
      }

      parts.push(`<${tags.identity}>\n${state.I}\n</${tags.identity}>`);
      parts.push(`<${tags.mission}>\n${state.Ms}\n</${tags.mission}>`);

      if (options?.includeOperatingProtocol !== false) {
        const protocolText = options?.customProtocolText ?? tags.defaultProtocolText;
        parts.push(`<${tags.operatingProtocol}>\n${protocolText}\n</${tags.operatingProtocol}>`);
      }

      if (Object.keys(state.Ds).length > 0) {
        parts.push(`<${tags.structuredData}>\n${JSON.stringify(state.Ds, null, 2)}\n</${tags.structuredData}>`);
      }

      if (state.Ka.size > 0) {
        const conceptsXml = Array.from(state.Ka.values())
          .map((c) => `  <${tags.concept} id="${c.id}" ${tags.descAttr}="${c.descrizione}">\n    ${c.corpo}\n  </${tags.concept}>`)
          .join('\n');
        parts.push(`<${tags.knowledge}>\n${conceptsXml}\n</${tags.knowledge}>`);
      }

      return parts.join('\n\n');
    }
  };
}

export const defaultEnglishXmlProjector: SystemFrameProjector = createXmlProjector({ language: 'en' });
export const defaultItalianXmlProjector: SystemFrameProjector = createXmlProjector({ language: 'it' });
export const defaultXmlProjector: SystemFrameProjector = defaultEnglishXmlProjector;
