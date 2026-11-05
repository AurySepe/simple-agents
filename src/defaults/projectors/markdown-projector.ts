import { SystemFrameProjector } from '../../engine/projection.js';

/**
 * Proiettore di stato predefinito in formato GitHub-Flavored Markdown.
 * Organizza le informazioni in sezioni chiare, leggibili e comprensibili per qualsiasi LLM.
 */
export const defaultMarkdownProjector: SystemFrameProjector = (directive, state) => {
  const sections: string[] = [];

  // 1. Identità dell'Agente
  sections.push(`# IDENTITÀ:\n${state.I}`);

  // 2. Obiettivo Operativo Corrente
  sections.push(`## OBIETTIVO CORRENTE:\n${state.Ms}`);

  // 3. Dati in Memoria di Lavoro
  if (Object.keys(state.Ds).length > 0) {
    sections.push(`## DATI IN MEMORIA DI LAVORO:\n\`\`\`json\n${JSON.stringify(state.Ds, null, 2)}\n\`\`\``);
  }

  // 4. Conoscenza e Linee Guida Attive
  if (state.Ka.size > 0) {
    const conceptEntries: string[] = [];
    for (const [id, concept] of state.Ka.entries()) {
      conceptEntries.push(`### [DOCUMENTO: ${id}] ${concept.descrizione}\n${concept.corpo}`);
    }
    sections.push(`## LINEE GUIDA E DOCUMENTI ATTIVI:\n${conceptEntries.join('\n\n')}`);
  }

  // 5. Strumenti Attualmente Abilitati
  if (state.Ta.size > 0) {
    sections.push(`## STRUMENTI ABILITATI PER L'AZIONE:\n${Array.from(state.Ta).map((t) => `- \`${t}\``).join('\n')}`);
  }

  // 6. Richiesta di Correzione Parametri
  if (directive.type === 'err_schema') {
    sections.push(
      `> [!IMPORTANT]\n> **RICHIESTA DI CORREZIONE PARAMETRI**:\n> La chiamata per l'azione \`${directive.targetToolId}\` non è valida.\n> Dettaglio dell'errore: ${directive.schemaErrorDetail}\n> Correggi i parametri per \`${directive.targetToolId}\` ed effettua nuovamente la chiamata, oppure emetti \`a_abort_call\` per annullarla.`
    );
  }

  return sections.join('\n\n');
};
