import { AgentState } from '../../types/index.js';
import { SystemFrameProjector } from '../../engine/projection.js';

export type ProjectorLanguage = 'it' | 'en';

export interface MarkdownProjectorOptions {
  language?: ProjectorLanguage;
  customHeader?: string;
  /**
   * Se includere la sezione esplicita di 'PROTOCOLLO OPERATIVO' nel frame di sistema.
   * Chiarisce al modello la distinzione formale tra azioni di mondo e azioni di terminazione
   * e il divieto di rispondere con testo discorsivo libero.
   * Default: true.
   */
  includeOperatingProtocol?: boolean;
  /**
   * Testo personalizzato per il protocollo operativo, che sostituisce il testo di default.
   */
  customProtocolText?: string;
}

const MARKDOWN_LABELS = {
  it: {
    identity: '# IDENTITÀ',
    mission: '## MISSIONE',
    operatingProtocol: '## PROTOCOLLO OPERATIVO',
    defaultProtocolText: `- Azioni sul Mondo: Consentono di interagire con l'ambiente esterno (es. interrogare banche dati o eseguire modifiche).
- Azioni di Terminazione: Devono essere invocate quando si decide di terminare la propria esecuzione (sia in caso di completamento dell'obiettivo, sia in caso di impossibilità a procedere, errore irrecuperabile o richiesta di intervento). La motivazione e il significato della chiusura dipendono dalla specifica azione di terminazione selezionata.
- Divieto di testo libero: Non comunicare mai a testo libero nella chat; ogni decisione, esito finale o stato di arresto deve essere formalizzato invocando l'azione appropriata.`,
    structuredData: '## DATI OPERATIVI STRUTTURATI',
    knowledge: '## CONOSCENZA ATTIVA',
    docPrefix: (id: string, desc: string) => `### [DOCUMENTO: ${id}] ${desc}`
  },
  en: {
    identity: '# IDENTITY',
    mission: '## MISSION',
    operatingProtocol: '## OPERATING PROTOCOL',
    defaultProtocolText: `- World Actions: Used to interact with the external environment (e.g. querying databases or executing changes).
- Termination Actions: Must be invoked when deciding to terminate execution (whether the goal is achieved, or in case of unrecoverable errors, inability to proceed, or need for intervention). The rationale and semantics of the closure depend on the specific termination action chosen.
- No Free-Text Output: Never communicate via conversational free text in chat; every decision, final output, or halt state must be formalized by invoking the appropriate action.`,
    structuredData: '## STRUCTURED OPERATIONAL DATA',
    knowledge: '## ACTIVE KNOWLEDGE',
    docPrefix: (id: string, desc: string) => `### [DOCUMENT: ${id}] ${desc}`
  }
} as const;

/**
 * Crea un proiettore di stato in formato GitHub-Flavored Markdown.
 * Supporta la localizzazione delle intestazioni ('it' o 'en') e l'inclusione del protocollo operativo.
 * Proietta puramente <I, Ms, Ds, Ka> nel canale system.
 */
export function createMarkdownProjector(options?: MarkdownProjectorOptions): SystemFrameProjector {
  const lang = options?.language ?? 'en';
  const labels = MARKDOWN_LABELS[lang];

  return {
    renderFrame(state: AgentState): string {
      const sections: string[] = [];

      if (options?.customHeader) {
        sections.push(options.customHeader);
      }

      // 1. Identità dell'Agente (I)
      sections.push(`${labels.identity}\n${state.I}`);

      // 2. Missione Operativa (Ms)
      sections.push(`${labels.mission}\n${state.Ms}`);

      // 3. Protocollo Operativo dell'Automa (se abilitato, default: true)
      if (options?.includeOperatingProtocol !== false) {
        const protocolText = options?.customProtocolText ?? labels.defaultProtocolText;
        sections.push(`${labels.operatingProtocol}\n${protocolText}`);
      }

      // 4. Mappa dei Dati Operativi Strutturati (Ds)
      if (Object.keys(state.Ds).length > 0) {
        sections.push(`${labels.structuredData}\n\`\`\`json\n${JSON.stringify(state.Ds, null, 2)}\n\`\`\``);
      }

      // 5. Conoscenza e Concetti Attivi (Ka)
      if (state.Ka.size > 0) {
        const conceptEntries: string[] = [];
        for (const [id, concept] of state.Ka.entries()) {
          conceptEntries.push(`${labels.docPrefix(id, concept.descrizione)}\n${concept.corpo}`);
        }
        sections.push(`${labels.knowledge}\n${conceptEntries.join('\n\n')}`);
      }

      return sections.join('\n\n');
    }
  };
}

export const defaultEnglishMarkdownProjector: SystemFrameProjector = createMarkdownProjector({ language: 'en' });
export const defaultItalianMarkdownProjector: SystemFrameProjector = createMarkdownProjector({ language: 'it' });
export const defaultMarkdownProjector: SystemFrameProjector = defaultEnglishMarkdownProjector;
