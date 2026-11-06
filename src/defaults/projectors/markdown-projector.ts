import { SystemFrameProjector } from '../../engine/projection.js';

export interface MarkdownProjectorOptions {
  awarenessPrompt?: string;
}

/**
 * Crea un proiettore di stato in formato GitHub-Flavored Markdown.
 * Supporta la configurazione opzionale del prompt di consapevolezza di Livello 1.
 */
export function createMarkdownProjector(options?: MarkdownProjectorOptions): SystemFrameProjector {
  return (directive, state, policy) => {
    const sections: string[] = [];

    // 1. Identità dell'Agente
    sections.push(`# IDENTITÀ:\n${state.I}`);

    // 2. Protocollo del Framework (Consapevolezza dell'Automa a Livello 1)
    const awareness = options?.awarenessPrompt ?? policy?.systemAwarenessPrompt;
    if (awareness) {
      sections.push(awareness);
    }

    // 3. Obiettivo Operativo Corrente
    sections.push(`## OBIETTIVO CORRENTE:\n${state.Ms}`);

    // 4. Dati in Memoria di Lavoro
    if (Object.keys(state.Ds).length > 0) {
      sections.push(`## DATI IN MEMORIA DI LAVORO:\n\`\`\`json\n${JSON.stringify(state.Ds, null, 2)}\n\`\`\``);
    }

    // 5. Conoscenza e Linee Guida Attive
    if (state.Ka.size > 0) {
      const conceptEntries: string[] = [];
      for (const [id, concept] of state.Ka.entries()) {
        conceptEntries.push(`### [DOCUMENTO: ${id}] ${concept.descrizione}\n${concept.corpo}`);
      }
      sections.push(`## LINEE GUIDA E DOCUMENTI ATTIVI:\n${conceptEntries.join('\n\n')}`);
    }

    // 6. Strumenti del Mondo in Dotazione
    if (state.Ta.size > 0) {
      const isIntro = directive.type === 'start_intro' || directive.type === 'loop_intro';
      if (isIntro) {
        sections.push(
          `## DOTAZIONE STRUMENTI MONDO (ATTIVI SOLO IN FASE OPERATIVA DOPO 'a_concludi_intro'):\n${Array.from(state.Ta).map((t) => `- \`${t}\``).join('\n')}`
        );
      } else {
        sections.push(
          `## STRUMENTI OPERATIVI ATTIVI SUL MONDO:\n${Array.from(state.Ta).map((t) => `- \`${t}\``).join('\n')}`
        );
      }
    }

    // 7. Richiesta di Correzione Parametri
    if (directive.type === 'err_schema') {
      sections.push(
        `> [!IMPORTANT]\n> **RICHIESTA DI CORREZIONE PARAMETRI**:\n> La chiamata per l'azione \`${directive.targetToolId}\` non è valida.\n> Dettaglio dell'errore: ${directive.schemaErrorDetail}\n> Correggi i parametri per \`${directive.targetToolId}\` ed effettua nuovamente la chiamata, oppure emetti \`a_abort_call\` per annullarla.`
      );
    }

    return sections.join('\n\n');
  };
}

/**
 * Proiettore di stato predefinito in formato GitHub-Flavored Markdown.
 * Organizza le informazioni in sezioni chiare, leggibili e comprensibili per qualsiasi LLM.
 */
export const defaultMarkdownProjector: SystemFrameProjector = createMarkdownProjector();
