import { SystemFrameProjector } from '../../engine/projection.js';

/**
 * Proiettore di stato predefinito in formato XML / Semantic Tags.
 * Particolarmente efficace con modelli istruiti a isolare contesti tramite tag delimitati.
 */
export const defaultXmlProjector: SystemFrameProjector = (directive, state) => {
  const parts: string[] = [];

  parts.push(`<identity>\n${state.I}\n</identity>`);
  parts.push(`<current_mission>\n${state.Ms}\n</current_mission>`);

  if (Object.keys(state.Ds).length > 0) {
    parts.push(`<structured_data>\n${JSON.stringify(state.Ds, null, 2)}\n</structured_data>`);
  }

  if (state.Ka.size > 0) {
    const conceptsXml = Array.from(state.Ka.values())
      .map((c) => `  <concept id="${c.id}" description="${c.descrizione}">\n    ${c.corpo}\n  </concept>`)
      .join('\n');
    parts.push(`<active_concepts>\n${conceptsXml}\n</active_concepts>`);
  }

  if (state.Ta.size > 0) {
    const toolsXml = Array.from(state.Ta)
      .map((t) => `  <tool id="${t}"/>`)
      .join('\n');
    parts.push(`<mounted_tools>\n${toolsXml}\n</mounted_tools>`);
  }

  if (directive.type === 'err_schema') {
    parts.push(
      `<schema_error target="${directive.targetToolId}">\n  <detail>${directive.schemaErrorDetail}</detail>\n  <instruction>Fornisci i parametri corretti per '${directive.targetToolId}' oppure invoca 'a_abort_call'.</instruction>\n</schema_error>`
    );
  }

  return parts.join('\n\n');
};

