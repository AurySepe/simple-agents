import { OrchestratorPolicy } from '../../engine/orchestrator.js';

/**
 * Policy di default in lingua inglese (standard internazionale).
 * Fornisce istruzioni naturali, chiare e operative, prive di gergo matematico interno.
 */
export const defaultEnglishPolicy: OrchestratorPolicy = {
  systemAwarenessPrompt: `## EXECUTION PROTOCOL (TWO-PHASE CYCLE):
System operation is governed by a recurring two-phase architecture:
1. **Internal Reflection Phase (Introspection)**:
   - Active at session start and upon receiving new data or results from the external World.
   - In this phase, analyze the available information within your thinking process and plan upcoming actions.
   - You may use any enabled cognitive tools to manage your internal state or working memory.
   - When internal deliberation is complete and you are ready to act in the World or conclude the request, invoke 'a_concludi_intro'.
2. **Operational Phase (Action in the World or Termination)**:
   - Both external World tools and the formal termination action for the final response are active.
   - Use external World tools to interact with the environment, or, if all operations are complete, invoke the termination action (e.g. 'rispondi_e_termina') with the required data to conclude.
   - Upon completion of World actions, the system returns results and brings you back to the reflection phase to examine them.
3. **Fundamental Response Rule**:
   - At any point, the ONLY tools you may invoke are strictly those provided in the active tools list for this specific turn.
   - During the Internal Reflection Phase, external World tools and termination actions are temporarily locked.
   - NEVER reply with plain text to conclude the task: the final response must be delivered through the dedicated termination action. If you are in the Internal Reflection Phase, invoke 'a_concludi_intro' first to transition to the Operational Phase and unlock the termination action.`,

  formatDirectivePrompt: (type) => {
    switch (type) {
      case 'start_intro':
        return "Internal reflection phase. You may examine available information and update your internal state or goal using enabled cognitive tools. External World tools and termination actions are not callable in this turn: the designated action to complete reflection and access the operational phase (to act on the World or conclude the task) is 'a_concludi_intro'.";
      case 'loop_intro':
        return "Internal state updated. You may perform further cognitive adjustments or, when reflection is complete, proceed to the operational phase via 'a_concludi_intro'.";
      case 'start_exec':
        return "Operational phase active. You can now use your available tools to interact with the environment, or invoke the termination action to provide the final response and conclude the task.";
    }
  },

  formatSchemaErrorPrompt: (targetToolId, errorDetail) => {
    return `An error occurred in parameters for '${targetToolId}': ${errorDetail}. Please fix the arguments and call again, or invoke 'a_abort_call' to cancel.`;
  },

  formatSyntaxErrorPrompt: (targetToolId, rawText, errorDetail) => {
    return `JSON syntax error in arguments for action '${targetToolId}': ${errorDetail}. Unparseable text received: "${rawText}". Please correct the JSON format and retry the call, or invoke 'a_abort_call' to cancel.`;
  },

  formatDirectiveMessageContent: (directive) => {
    return directive.prompt;
  },

  formatAbortResultContent: (targetToolId) => {
    return `Execution request for '${targetToolId}' was successfully cancelled by the assistant.`;
  },

  formatVoidResultContent: () => {
    return 'OK';
  },

  formatControlActionDescription: (action) => {
    switch (action) {
      case 'a_concludi_intro':
        return "Finish internal preparation and proceed to the operational execution phase on the task.";
      case 'a_abort_call':
        return "Cancel the invalid call and skip the operation to allow execution to proceed.";
    }
  },

  formatInternalErrorDetail: (kind, context) => {
    switch (kind) {
      case 'xor_concludi_violation':
        return "'a_concludi_intro' is solely meant to conclude preparation: call it by itself, without combining other actions in the same turn.";
      case 'unauthorized_cognitive_action':
        return `The action '${context?.toolId}' belongs to the external World or is not enabled for internal reflection. External World tools are accessible only in the operational phase (after 'a_concludi_intro'). Invoke 'a_abort_call' to cancel the invalid call.`;
      case 'unregistered_cognitive_action':
        return `The action '${context?.toolId}' is not recognized by the system.`;
      case 'unmounted_world_tool':
        return `The tool '${context?.toolId}' is not currently active. Enable it first using the tool loading action before calling it.`;
      case 'unregistered_world_tool':
        return `The tool '${context?.toolId}' does not exist in the available catalog.`;
    }
  },

  validationMessages: {
    nuovo_scopo_required: "Specify the new goal to focus on (cannot be empty).",
    chiave_required: "Specify the variable name to store (cannot be empty).",
    query_required: "Specify the search query to execute (cannot be empty).",
    tool_ids_required: "Provide at least one tool identifier to select.",
    concetto_ids_required: "Provide at least one document or concept identifier to select.",
    sintesi_required: "Provide summary text for the messages to be compacted.",
    invalid_indices: "The message compaction range [start_idx, end_idx] is invalid."
  },

  cognitiveMetadata: {
    aggiorna_missione: {
      toolName: 'update_mission',
      description: 'Update the current operational goal you are focusing on in this session.'
    },
    imposta_dato: {
      toolName: 'set_context_data',
      description: 'Save or update a useful variable in working memory for subsequent steps.'
    },
    elimina_dato: {
      toolName: 'delete_context_data',
      description: 'Remove a variable that is no longer needed from working memory.'
    },
    compatta_memoria: {
      toolName: 'compact_memory',
      description: 'Summarize a range of earlier messages to save context space while preserving key details.'
    },
    cerca_tool: {
      toolName: 'search_tools',
      description: 'Search the catalog to discover which tools are available.'
    },
    carica_tool: {
      toolName: 'load_tools',
      description: 'Enable one or more tools to make them directly usable in the operational phase.'
    },
    scarica_tool: {
      toolName: 'unload_tools',
      description: 'Disable tools that are no longer needed to keep context clean and focused.'
    },
    cerca_concetti: {
      toolName: 'search_concepts',
      description: 'Search documents, guidelines, or relevant knowledge in the knowledge base.'
    },
    carica_concetto: {
      toolName: 'load_concepts',
      description: 'Load the full text of a document into active memory for consultation.'
    },
    scarica_concetto: {
      toolName: 'unload_concepts',
      description: 'Remove a document from active memory when it is no longer needed.'
    }
  }
};
