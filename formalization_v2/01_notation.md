# 01. Notazione e Simboli Matematici

Questo documento fissa la semantica assiomatica di simboli, operatori algebrici, insiemi e relazioni tipizzate utilizzati nella formalizzazione dell'Agente Operativo a Ciclo Singolo ($\Omega_{op}$).

---

## 1. Operatori Algebrici e Relazioni di Tipo

| Simbolo | Nome | Definizione Formale | Documento Correlato |
| :--- | :--- | :--- | :--- |
| $\models$ | **Soddisfacimento di Tipo** | $x \models \sigma \iff \text{Validate}_\sigma(x) = \text{valid}$. Attesta che il payload $x$ rispetta rigidamente lo schema contrattuale $\sigma$. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\not\models$ | **Violazione di Tipo** | $x \not\models \sigma \iff \neg(x \models \sigma)$. Attesta un errore di schema o sintassi. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $\oplus_{ext}$ | **Aggiornamento Esogeno** | $S' = S \oplus_{ext} \Delta S$. Operatore di transizione di stato applicabile dall'ambiente/runtime esterno durante lo stato di riposo ($q_{sleep}$). | [02_state_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/02_state_space.md) |
| $\cdot$ | **Concatenazione di Eventi** | $E_p' = E_p \cdot e$. Accodamento deterministico di un nuovo evento/messaggio alla sequenza temporale della traccia. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $\emptyset$ | **Insieme Vuoto** | Assenza totale di elementi nell'insieme specificato. | - |
| $\subseteq$ | **Sottoinsieme** | Relazione di contenimento ($Y \subseteq T_a \implies$ insieme di chiamate a tool ammissibili). | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\setminus$ | **Differenza Insiemistica** | Sottrazione di insiemi. | - |
| $\cup$ | **Unione Insiemistica** | Unione logica di insiemi o domini di azione. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\sigma$ | **Firma / Schema** | Contratto formale di tipo ($\sigma_{in}$ per i parametri di input, $\sigma_{out}$ per il valore di ritorno). | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\mathcal{P}(X)$ | **Insieme delle Parti** | L'insieme di tutti i possibili sottoinsiemi dell'insieme $X$. | - |

---

## 2. Insiemi Fondamentali ed Entità di Sistema

| Simbolo | Nome | Descrizione e Ruolo Formale | Documento Correlato |
| :--- | :--- | :--- | :--- |
| $\Omega_{op}$ | **Orchestratore Operativo** | Macchina formale immutabile che applica le regole fisiche, valida gli schemi, gestisce la FSM e garantisce la sicurezza del runtime. | [08_architecture_levels.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/08_architecture_levels.md) |
| $A_{op}$ | **Tupla dell'Agente Operativo** | Definizione algebrica dell'agente: $\langle S, \mathcal{Q}, \Sigma, \delta_{trans}, q_{sleep}, \{q_{halt}\} \rangle$. | [01_notation.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/01_notation.md) |
| $S$ | **Spazio degli Stati** | Configurazione globale dell'agente: $S = \langle I, M_s, D_s, T_a, K_a, E_p \rangle$. | [02_state_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/02_state_space.md) |
| $D_s$ | **Dati Operativi Strutturati** | Mappa associativa chiave-valore tipizzata ($D_s \in \mathcal{K} \to \mathcal{V}$) contenente variabili di contesto e runtime. | [02_state_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/02_state_space.md) |
| $K_a$ | **Buffer Concetti Attivi** | Conoscenza semantica esplicitamente caricata nella consapevolezza operativa. | [02_state_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/02_state_space.md) |
| $\mathcal{Q}$ | **Stati FSM** | Insieme discreto di controllo: $\{ q_{sleep}, q_{exec}, q_{yield}, q_{repair}, q_{halt} \}$. | [03_fsm_states.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/03_fsm_states.md) |
| $\Sigma$ | **Spazio delle Azioni** | Alfabeto totale delle azioni: $\Sigma = T_a \cup A_{term} \cup \{ a_{abort\_call} \}$. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $T_a$ | **Tool Fisici Attivi** | Funzioni operative disponibili sul mondo $W$ per interagire con l'ambiente esterno. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $A_{term}$ | **Contratti di Terminazione** | Insieme di funzioni di uscita fortemente tipizzate tramite cui l'agente restituisce l'esito finale all'utente. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $a_{abort\_call}$ | **Azione Atomica di Abort** | Azione speciale di recupero in $q_{repair}$ che annulla una chiamata malformata e rilascia il turno. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\mathcal{V}_\Omega$ | **Funzione di Visibilità** | Mappa dinamica che determina l'insieme di azioni visibili ed invocabili in base allo stato $q \in \mathcal{Q}$. | [04_action_space.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md) |
| $\mathcal{F}_\Omega$ | **Funzione di Proiezione** | Mappatura pura che proietta le componenti semantiche dello stato $S$ nel messaggio di sistema. | [05_inference_triple.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/05_inference_triple.md) |
| $\mathcal{C}_\Omega$ | **Tripla di Inferenza** | Struttura unificata inoltrata al modello linguistico: $\mathcal{C}_\Omega = \langle \mathcal{F}_\Omega(S), E_p, \mathcal{V}_\Omega(q) \rangle$. | [05_inference_triple.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/05_inference_triple.md) |
| $\mathbb{M}$ | **Modello Linguistico** | Trasduttore stocastico $\mathbb{M}(\mathcal{C}_\Omega) \to \langle \text{thought}^?, \mathcal{A}_{calls} \rangle$. | [05_inference_triple.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/05_inference_triple.md) |
| $E_p$ | **Traccia degli Eventi** | Sequenza ordinata di eventi tipizzati: $E_p = [e_0, e_1, \dots, e_n]$. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $e$ | **Evento Epistemico** | 4-upla atomica: $e = \langle \tau, \text{type}, \mu, id \rangle$. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $\mathcal{T}_{event}$ | **Spazio Tipi di Evento** | Insieme discreto dei tipi: $\{\text{stimulus}, \text{thought}, \text{action}, \text{result}\}$. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $\tau$ | **Marca Temporale** | Coppia ordinata $\langle c, t \rangle$: macro-ciclo del task $c$ e tick deliberativo $t$. | [06_message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md) |
| $\delta_{trans}$ | **Funzione di Transizione** | Regola globale deterministica di transizione di stato: $\delta_{trans}: \mathcal{Q} \times \Sigma_{event} \to \mathcal{Q}$. | [07_transitions_and_execution.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/07_transitions_and_execution.md) |
| $W$ | **Mondo Fisico Esterno** | Ambiente di esecuzione che implementa i tool fisici ed espone risorse esterne. | [08_architecture_levels.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/08_architecture_levels.md) |

---

## 3. Tupla Fondamentale dell'Agente Operativo ($A_{op}$)

Un **Agente Operativo** è formalmente specificato dalla 6-upla algebrica:

$$A_{op} = \langle S, \mathcal{Q}, \Sigma, \delta_{trans}, q_{sleep}, \{ q_{halt} \} \rangle$$

### Vincoli Assiomatici Fondamentali:
1. **Chiusura Computazionale**: L'agente non può emettere azioni esterne a $\Sigma$. Qualsiasi simbolo generato non appartenente a $\mathcal{V}_\Omega(q)$ viene intercettato da $\Omega_{op}$ e trattato come violazione di schema.
2. **Determinismo di Controllo**: A fronte di una coppia stato-evento $(q, e)$, lo stato successivo $q' = \delta_{trans}(q, e)$ è rigidamente deterministico.
3. **Assorbimento Terminale**: Raggiunto lo stato $q_{halt}$, l'automa termina definitivamente l'esecuzione, emette la risposta tipizzata e non ammette transizioni uscenti.

