import { OrchestratorPolicy } from '../../engine/orchestrator.js';

/**
 * Policy di default in lingua italiana.
 * Fornisce testi chiari, operativi e privi di gergo matematico interno,
 * formulati per guidare l'LLM con la massima efficacia decisionale.
 */
export const defaultItalianPolicy: OrchestratorPolicy = {
  formatDirectivePrompt: (type) => {
    switch (type) {
      case 'start_intro':
        return "Fase di preparazione interna. Prima di interagire con l'esterno, puoi aggiornare il tuo obiettivo, memorizzare dati utili o attivare gli strumenti e i documenti necessari. Quando hai completato i preparativi e sei pronto ad agire, chiama 'a_concludi_intro'.";
      case 'loop_intro':
        return "Memoria interna aggiornata. Puoi effettuare ulteriori modifiche o chiamare 'a_concludi_intro' per passare all'azione.";
      case 'start_exec':
        return "Fase operativa attiva. Ora puoi utilizzare gli strumenti a tua disposizione per interagire con l'ambiente, oppure inviare la tua risposta finale per concludere il compito.";
    }
  },

  formatSchemaErrorPrompt: (targetToolId, errorDetail) => {
    return `Si è verificato un errore nei parametri per l'azione '${targetToolId}': ${errorDetail}. Correggi i parametri ed effettua nuovamente la chiamata, oppure invoca 'a_abort_call' per annullarla.`;
  },

  formatDirectiveMessageContent: (directive) => {
    return `[DIRETTIVA: ${directive.type.toUpperCase()}] ${directive.prompt}`;
  },

  formatAbortResultContent: (targetToolId) => {
    return `La richiesta di chiamata per '${targetToolId}' è stata revocata con successo su istruzione dell'assistente.`;
  },

  formatVoidResultContent: () => {
    return 'OK';
  },

  formatControlActionDescription: (action) => {
    switch (action) {
      case 'a_concludi_intro':
        return "Termina la fase di preparazione interna e avvia la fase operativa di esecuzione sul compito.";
      case 'a_abort_call':
        return "Annulla la chiamata non valida e rinuncia all'operazione per consentire all'esecuzione di proseguire.";
    }
  },

  formatInternalErrorDetail: (kind, context) => {
    switch (kind) {
      case 'no_action_in_intro':
        return "Nessuna azione selezionata: aggiorna la tua memoria interna oppure chiama 'a_concludi_intro' per procedere.";
      case 'xor_concludi_violation':
        return "'a_concludi_intro' serve esclusivamente a chiudere la preparazione: invocala da sola, senza combinare altre azioni nello stesso messaggio.";
      case 'unauthorized_cognitive_action':
        return `L'azione '${context?.toolId}' non è abilitata per questa sessione di lavoro.`;
      case 'unregistered_cognitive_action':
        return `L'azione '${context?.toolId}' non è riconosciuta dal sistema.`;
      case 'no_call_in_exec':
        return "Nessuna azione intrapresa: usa uno degli strumenti disponibili oppure invia la risposta finale per completare il compito.";
      case 'unmounted_world_tool':
        return `Lo strumento '${context?.toolId}' non è al momento abilitato. Attivalo tramite lo strumento di caricamento prima di chiamarlo.`;
      case 'unregistered_world_tool':
        return `Lo strumento '${context?.toolId}' non è presente nel catalogo disponibile.`;
    }
  },

  validationMessages: {
    nuovo_scopo_required: "Specificare il nuovo obiettivo su cui concentrarsi (non può essere vuoto).",
    chiave_required: "Specificare il nome della variabile da salvare (non può essere vuoto).",
    query_required: "Specificare il testo di ricerca da eseguire (non può essere vuoto).",
    tool_ids_required: "Indicare almeno uno strumento da selezionare.",
    concetto_ids_required: "Indicare almeno un documento o concetto da selezionare.",
    sintesi_required: "Fornire un testo di riassunto per i messaggi da compattare.",
    invalid_indices: "Gli indici dei messaggi da compattare non sono validi."
  },

  cognitiveMetadata: {
    aggiorna_missione: {
      toolName: 'aggiorna_missione',
      description: "Aggiorna l'obiettivo corrente su cui ti stai focalizzando in questa sessione."
    },
    imposta_dato: {
      toolName: 'imposta_dato',
      description: "Salva o aggiorna un dato utile nella memoria di lavoro per le interazioni successive."
    },
    elimina_dato: {
      toolName: 'elimina_dato',
      description: "Rimuove un dato non più necessario dalla memoria di lavoro."
    },
    compatta_memoria: {
      toolName: 'compatta_memoria',
      description: "Riassume una serie di messaggi precedenti per risparmiare spazio di contesto, mantenendo i dettagli salienti."
    },
    cerca_tool: {
      toolName: 'cerca_tool',
      description: "Cerca nel catalogo per trovare quali strumenti sono disponibili."
    },
    carica_tool: {
      toolName: 'carica_tool',
      description: "Abilita uno o più strumenti per poterli utilizzare direttamente nella fase operativa."
    },
    scarica_tool: {
      toolName: 'scarica_tool',
      description: "Disabilita strumenti non più necessari per mantenere il contesto leggero e pulito."
    },
    cerca_concetti: {
      toolName: 'cerca_concetti',
      description: "Cerca documenti, linee guida o informazioni rilevanti nella base di conoscenza."
    },
    carica_concetto: {
      toolName: 'carica_concetto',
      description: "Carica il testo completo di un documento nella memoria attiva per poterlo consultare."
    },
    scarica_concetto: {
      toolName: 'scarica_concetto',
      description: "Rimuove un documento dalla memoria attiva quando non serve più."
    }
  }
};
