# 01. Notazione e Simboli Matematici

Questo documento fissa la semantica formale di simboli, operatori algebrici, insiemi e relazioni di tipo. Serve come dizionario rapido per tutta la documentazione.

---

## 1. Operatori Algebrici e Relazioni di Tipo

| Simbolo | Nome | Definizione Rapida | Documento Correlato |
| :--- | :--- | :--- | :--- |
| $\oplus$ | **Fusione di Stato** | Combina e fonde due contesti informativi ($S_{prev} \oplus P$ o $s_k \oplus R_k \oplus \delta$), aggiornando coerentemente la memoria. | [02_framework/fusion_operator.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/fusion_operator.md) |
| $\models$ | **Soddisfacimento di Tipo** | $x \models \sigma$ attesta che il payload $x$ rispetta rigidamente lo schema o contratto formale $\sigma$. | [03_world/tool_signatures.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/tool_signatures.md) |
| $\Delta$ | **Spazio delle Direttive** | Insieme delle direttive epistemiche di controllo iniettate dall'Orchestratore $\Omega$. | [02_framework/directives.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/directives.md) |
| $\emptyset$ | **Insieme Vuoto** | Assenza di elementi (es. $A_{int} = \emptyset$ o payload vuoto $\emptyset$). | - |
| $\subseteq$ | **Sottoinsieme** | Relazione di contenimento ($X_k \subseteq A_{int}$, $T_{a0} \subseteq W$). | - |
| $\setminus$ | **Differenza Insiemistica** | Elementi presenti nel primo insieme ma esclusi dal secondo. | - |
| $\cup$ | **Unione Insiemistica** | Unione logica di domini o insiemi di azioni. | - |
| $\sigma$ | **Firma / Schema** | Struttura contrattuale di validazione di input ($\sigma_{in}$) o output ($\sigma_{out}$). | [03_world/tool_signatures.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/tool_signatures.md) |

---

## 2. Insiemi Fondamentali ed Entità

| Simbolo | Nome | Ruolo e Definizione Rapida | Documento Correlato |
| :--- | :--- | :--- | :--- |
| $\Omega$ | **Orchestratore** | Motore formale immutabile che applica le regole fisiche, gestisce il routing e garantisce la sicurezza. | [02_framework/README.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/README.md) |
| $G_\Omega$ | **Funzione Router** | Seleziona deterministamente se avviare il loop cognitivo $\Phi_{intro}$ o quello reattivo $\Phi_{exec}$. | [02_framework/router.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/router.md) |
| $\Phi_{intro}$ | **Loop Introspettivo** | Fase 1 di allineamento e convergenza della mente dell'agente tramite micro-step $k$. | [02_framework/loop_intro.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md) |
| $\Phi_{exec}$ | **Loop Esecutivo** | Fase 2 di interazione con il mondo esterno $W$ e terminazione tipizzata. | [02_framework/loop_exec.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_exec.md) |
| $A_{int\_universal}$ | **Universo Cognitivo Globale** | Insieme universale di tutte le primitive introspettive offerte da $\Omega$. | [02_framework/introspective_universe.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/introspective_universe.md) |
| $a_{concludi\_intro}$ | **Azione Speciale di Chiusura** | Azione atomica senza parametri per attestare la convergenza di $\Phi_{intro}$. | [02_framework/loop_intro.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md) |
| $\delta$ | **Direttive di Sistema** | Vettori vincolanti $\delta_{start\_intro}, \delta_{loop\_intro}, \delta_{start\_exec}, \delta_{err\_schema}$ iniettati da $\Omega$. | [02_framework/directives.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/directives.md) |
| $\mathcal{V}_\Omega$ | **Funzione di Visibilità** | Maschera di capacità che definisce lo spazio di azioni consentite in base a $\delta$ e $S$. | [02_framework/visibility_function.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/visibility_function.md) |
| $\mathcal{F}_\Omega$ | **Funzione di Proiezione** | Genera il Frame di Stato dinamico per il canale di sistema (chi sono e cosa so). | [02_framework/frame_projection.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/frame_projection.md) |
| $\mathcal{T}_\Omega$ | **Algebra Transizioni Cognitive** | Funzione formale di transizione che mappa $(a \in A_{int\_universal}, S) \to (S', R)$. | [02_framework/introspective_universe.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/introspective_universe.md) |
| $\mathbb{M}$ | **Funzione Modello Linguistico** | Trasduttore di inferenza $\mathbb{M}(\mathcal{C}_\Omega) \to \langle \text{thought}^?, \mathcal{A}_{calls} \rangle$. | [02_framework/frame_projection.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/frame_projection.md) |
| $\mathcal{C}_\Omega$ | **Tripla di Inferenza** | Struttura completa inviata all'LLM: $\langle \mathcal{F}_\Omega, E_p, \mathcal{V}_\Omega \rangle$. | [02_framework/frame_projection.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/frame_projection.md) |
| $\mathcal{M}_{FSM}$ | **Automa a Stati Finiti** | Macchina formale a 6 coordinate $\langle \mathcal{Q}, \Sigma_{in}, \Sigma_{out}, \Delta_{trans}, q_{sleep}, \{q_{halt}\} \rangle$. | [02_framework/fsm_states.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/fsm_states.md) |
| $a_{abort\_call}$ | **Azione Atomica di Rinuncia** | Azione per abortire una chiamata non valida in fase di correzione schema consumando il turno. | [02_framework/visibility_function.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/visibility_function.md) |
| $\Pi$ | **Spazio dei Ruoli Epistemici** | Insieme delle sorgenti di autorità dei messaggi: $\Pi = \{\pi_\Omega, \pi_{agent}, \pi_{world}, \pi_{user}\}$. | [02_framework/message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md) |
| $\mathcal{K}$ | **Canali di Messaggio** | Tipi di messaggio: $\{\text{thought}, \text{call}, \text{result}, \text{directive}, \text{payload}, \text{summary}\}$. | [02_framework/message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md) |
| $\tau$ | **Marca Temporale Duplice** | Coppia $\langle c, t \rangle$: macro-ciclo del mondo $c$ e tick decisionale di direttiva $t$. | [02_framework/message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md) |
| $e$ | **Messaggio Atomico** | 5-upla formale $e = \langle \tau, \pi, \kappa, \mu, id \rangle$. | [02_framework/message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md) |
| $W$ | **Mondo / Tool fisici** | Catalogo esterno di funzioni fisiche tipizzate dotate di effetti collaterali. | [03_world/README.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/README.md) |
| $S_0$ | **Vettore Iniziale di Stato** | Configurazione iniziale a $t=0$: identità $I$, missione $M_s$, memoria $D_s$, tool $T_a$, concetti $K_a$, eventi $E_p$. | [04_manifest/initial_state.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/initial_state.md) |
| $K_a$ | **Buffer Concetti Attivi** | Conoscenza semantica esplicitamente caricata nella consapevolezza operativa. | [04_manifest/initial_state.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/initial_state.md) |
| $A_{int}$ | **Permessi Cognitivi** | Sottoinsieme capability-based delle facoltà introspettive assegnate all'agente. | [04_manifest/cognitive_permissions.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/cognitive_permissions.md) |
| $A_{term}$ | **Contratti di Terminazione** | Porte di uscita tipizzate che decretano l'Halt del processo e restituiscono il risultato. | [04_manifest/termination_contracts.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/termination_contracts.md) |
| $S_t$ | **Macro-Stato** | Stato globale dell'agente al macro-tempo $t$. | [02_framework/README.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/README.md) |
| $s_k$ | **Micro-Stato** | Stato volatile al micro-step $k$ durante $\Phi_{intro}$. | [02_framework/loop_intro.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md) |
| $P_t$ | **Payload dal Mondo** | Input esterno che desta l'agente al tempo $t$. | [03_world/README.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/README.md) |
