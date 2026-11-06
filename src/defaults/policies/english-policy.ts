import { OrchestratorPolicy } from '../../engine/orchestrator.js';

/**
 * Policy di default in lingua inglese (standard internazionale).
 * Fornisce istruzioni naturali, chiare e operative, prive di gergo matematico interno.
 */
export const defaultEnglishPolicy: OrchestratorPolicy = {
  systemAwarenessPrompt: `## EXECUTION PROTOCOL (TWO-PHASE CYCLE):
System operation is governed by a recurring two-phase architecture:
1. **Internal Reflection Phase (Introspection)**:
   - Active at session start and upon receiving new data or results from the external environment.
   - Dedicated solely to internal processing: examine information, understand concepts, and update internal state or working memory via enabled cognitive tools.
   - In this phase you do NOT interact with the environment or conclude the task: detailed planning of operational actions or final replies is not required or intended here, as that will be addressed directly in the subsequent operational phase.
   - When internal deliberation is complete, the designated action to proceed is solely 'a_concludi_intro'.
2. **Operational Phase (Action in Environment or Termination)**:
   - In this phase, all external environment tools and all formal termination actions for task completion become fully accessible.
   - Use available tools to execute required actions or, when the task is complete, invoke the formal termination action to submit the final result.
   - Upon completion of environment actions, the system returns results and brings you back to the reflection phase to assimilate them.
3. **Fundamental Response Rule**:
   - At any point, the ONLY tools you may invoke are strictly those provided in the active tools list for this specific turn.
   - During the Internal Reflection Phase, operational and termination tools are not active: do not attempt to invoke them or respond with plain text. When you intend to act or conclude, invoke 'a_concludi_intro' to enter the Operational Phase where those actions will be available.`,

  formatPhaseNotice: (phase) => {
    if (phase === 'intro') {
      return `▶ **Internal Reflection Phase (Introspection)**\nIn this turn you are in internal reflection to examine data and update state. Operational tools and termination actions are not active in this micro-step: do not plan the operational action or final reply right now. When you have examined information, invoke 'a_concludi_intro' to access the operational phase where you can act or conclude.`;
    }
    return `▶ **Operational Phase (Action in Environment or Termination)**\nIn this turn you are in the operational phase. All tools for interacting with the environment and termination actions for submitting the final result and concluding the task are active.`;
  },

  formatDirectivePrompt: (type) => {
    switch (type) {
      case 'start_intro':
        return "Initial internal reflection phase to examine the request and update internal state via enabled cognitive tools. All operational actions (interacting with the environment or formal task termination) will be accessible in the subsequent operational phase once reflection is concluded via 'a_concludi_intro'.";
      case 'resume_intro':
        return "Results from the external environment received. You have returned to the internal reflection phase to assimilate them and optionally update your internal state. Remember you are in internal reflection (operational and termination tools are not active in this micro-step): to proceed with the next action in the environment or to conclude the task, invoke 'a_concludi_intro'.";
      case 'loop_intro':
        return "Internal state updated. You may perform further cognitive adjustments or proceed to the operational phase via 'a_concludi_intro'.";
      case 'start_exec':
        return "Operational phase active. You can now use available tools to interact with the environment, or invoke the termination action to submit the final result and conclude the task.";
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
        return "Conclude current internal reflection and proceed to the operational execution phase on the task.";
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
