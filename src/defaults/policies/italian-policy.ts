import { OrchestratorPolicy } from '../../engine/orchestrator.js';

/**
 * Policy di default in lingua italiana.
 * Fornisce testi chiari, operativi e privi di gergo matematico interno,
 * formulati per guidare l'LLM con la massima efficacia decisionale.
 */
export const defaultItalianPolicy: OrchestratorPolicy = {
  systemAwarenessPrompt: `## PROTOCOLLO DI ESECUZIONE (CICLO A DUE FASI):
Il funzionamento del sistema è governato da un'architettura a due fasi ricorrenti:
1. **Fase di Riflessione Interna (Introspezione)**:
   - È attiva all'avvio della sessione e ad ogni ricezione di nuovi dati o esiti dal Mondo esterno.
   - In questa fase analizzi nel tuo pensiero (thinking) le informazioni disponibili e pianifichi le prossime azioni.
   - Puoi utilizzare eventuali strumenti cognitivi abilitati per gestire il tuo stato interno o la tua memoria.
   - Quando ritieni di aver completato le valutazioni interne e sei pronto ad agire nel Mondo o a chiudere la richiesta, invoca l'azione 'a_concludi_intro'.
2. **Fase Operativa (Azione nel Mondo o Terminazione)**:
   - Sono attivi sia gli strumenti del Mondo esterno a tua disposizione, sia l'azione formale di terminazione per la risposta definitiva al cliente.
   - Utilizzi gli strumenti del Mondo esterno per interagire con l'ambiente, oppure, se le verifiche e le operazioni sono concluse, invochi l'azione di terminazione (es. 'rispondi_e_termina') per restituire il riepilogo finale e chiudere.
   - Al termine dell'esecuzione di azioni nel Mondo, il sistema restituirà i risultati e ti ricondurrà nella fase di riflessione per esaminarli.
3. **Regola Fondamentale di Risposta**:
   - In qualsiasi momento, gli UNICI strumenti che puoi invocare sono rigorosamente quelli definiti nella lista dei tool attivi per questo specifico turno.
   - Durante la Fase di Riflessione Interna gli strumenti del Mondo esterno e le azioni di terminazione sono temporaneamente bloccati.
   - Non rispondere MAI con semplice testo libero: l'esito finale deve essere obbligatoriamente comunicato tramite l'azione formale di terminazione. Se ti trovi nella Fase di Riflessione Interna, invoca prima 'a_concludi_intro' per passare alla Fase Operativa e sbloccare l'azione di terminazione.`,

  formatDirectivePrompt: (type) => {
    switch (type) {
      case 'start_intro':
        return "Fase di riflessione interna. Puoi esaminare le informazioni disponibili e aggiornare il tuo stato o scopo interiore mediante gli strumenti cognitivi abilitati. Gli strumenti del Mondo esterno e di terminazione non sono invocabili in questo micro-passo: l'azione designata per terminare la riflessione e accedere alla fase operativa (per agire sul Mondo o per concludere il compito) è 'a_concludi_intro'.";
      case 'loop_intro':
        return "Stato interno aggiornato. Puoi effettuare ulteriori operazioni cognitive oppure, quando riterrai conclusa la riflessione, passare alla fase operativa tramite 'a_concludi_intro'.";
      case 'start_exec':
        return "Fase operativa attiva. Ora puoi utilizzare gli strumenti a tua disposizione per interagire con l'ambiente, oppure invocare l'azione di terminazione per fornire la risposta finale e concludere il compito.";
    }
  },

  formatSchemaErrorPrompt: (targetToolId, errorDetail) => {
    return `Si è verificato un errore nei parametri per l'azione '${targetToolId}': ${errorDetail}. Correggi i parametri ed effettua nuovamente la chiamata, oppure invoca 'a_abort_call' per annullarla.`;
  },

  formatSyntaxErrorPrompt: (targetToolId, rawText, errorDetail) => {
    return `Errore di sintassi JSON negli argomenti per l'azione '${targetToolId}': ${errorDetail}. Testo non parsabile ricevuto: "${rawText}". Correggi la formattazione JSON ed effettua nuovamente la chiamata, oppure invoca 'a_abort_call' per annullarla.`;
  },

  formatDirectiveMessageContent: (directive) => {
    return directive.prompt;
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
      case 'xor_concludi_violation':
        return "'a_concludi_intro' serve esclusivamente a chiudere la preparazione: invocala da sola, senza combinare altre azioni nello stesso messaggio.";
      case 'unauthorized_cognitive_action':
        return `L'azione '${context?.toolId}' appartiene al Mondo esterno o non è abilitata per la riflessione interna. Gli strumenti del Mondo esterno sono accessibili solo nella fase operativa (dopo 'a_concludi_intro'). Invoca 'a_abort_call' per annullare la chiamata non valida.`;
      case 'unregistered_cognitive_action':
        return `L'azione '${context?.toolId}' non è riconosciuta dal sistema.`;
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
