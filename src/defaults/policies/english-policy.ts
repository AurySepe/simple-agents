import { OrchestratorPolicy } from '../../engine/orchestrator.js';

/**
 * Policy di default in lingua inglese (standard internazionale).
 * Fornisce istruzioni naturali, chiare e operative, prive di gergo matematico interno.
 */
export const defaultEnglishPolicy: OrchestratorPolicy = {
  formatDirectivePrompt: (type) => {
    switch (type) {
      case 'start_intro':
        return "Internal preparation phase. Before interacting externally, you can update your current goal, store useful data, or activate the necessary tools and documents. When you have completed preparations and are ready to act, call 'a_concludi_intro'.";
      case 'loop_intro':
        return "Internal memory updated. You can make further adjustments or call 'a_concludi_intro' to proceed to action.";
      case 'start_exec':
        return "Operational phase active. You can now use your available tools to interact with the environment, or send your final response to complete the task.";
    }
  },

  formatSchemaErrorPrompt: (targetToolId, errorDetail) => {
    return `An error occurred in parameters for '${targetToolId}': ${errorDetail}. Please fix the arguments and call again, or invoke 'a_abort_call' to cancel.`;
  },

  formatDirectiveMessageContent: (directive) => {
    return `[DIRECTIVE: ${directive.type.toUpperCase()}] ${directive.prompt}`;
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
      case 'no_action_in_intro':
        return "No action selected: update your internal memory or call 'a_concludi_intro' to proceed.";
      case 'xor_concludi_violation':
        return "'a_concludi_intro' is solely meant to conclude preparation: call it by itself, without combining other actions in the same turn.";
      case 'unauthorized_cognitive_action':
        return `The action '${context?.toolId}' is not enabled for this session.`;
      case 'unregistered_cognitive_action':
        return `The action '${context?.toolId}' is not recognized by the system.`;
      case 'no_call_in_exec':
        return "No action taken: use one of the available tools or send the final response to complete the task.";
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
