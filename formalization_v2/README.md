# Framework Formale per Agenti Operativi a Ciclo Singolo ($\Omega_{op}$)

Benvenuto nella specifica matematica e architetturale del **Framework per Agenti Operativi a Ciclo Singolo** ($\Omega_{op}$).

Questo corpus documentale fornisce una formalizzazione assiomatica, rigorosa e autosufficiente per agenti computazionali autonomi basati su modelli linguistici di grandi dimensioni ($\mathbb{M}$), governati da un automa a stati finiti deterministico, fortemente tipizzato e orientato all'azione nel mondo.

---

## 1. Mappa Concettuale dei Documenti

La formalizzazione è organizzata in moduli concettuali indipendenti e componibili:

```
formalization_v2/
├── README.md                              <- Mappa concettuale e introduzione architetturale
├── 01_notation.md                         <- Notazione formale, simboli e tupla fondamentale dell'Agente
├── 02_state_space.md                      <- Spazio degli stati: dualità endogena/esogena e partizioni
├── 03_fsm_states.md                       <- Automa a Stati Finiti (FSM), stati di controllo e grafo di transizione
├── 04_action_space.md                     <- Spazio delle azioni: tool fisici, contratti terminali e visibilità
├── 05_inference_triple.md                 <- Tripla di inferenza, proiezione di frame e modello linguistico
├── 06_message_ontology.md                 <- Ontologia dei messaggi, traccia canonica e feedback di errore nativo
├── 07_transitions_and_execution.md        <- Meccanica di esecuzione: macro-cicli, parallelismo e convergenza
└── 08_architecture_levels.md              <- Architettura a 3 livelli: Framework, Mondo e Agente
```

---

## 2. Sintesi dei Moduli

### [01. Notazione e Simboli Matematici](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/01_notation.md)
Definisce l'alfabeto matematico, le relazioni d'ordine e di tipo, la semantica di conformità agli schemi ($\models$) e la tupla fondamentale dell'agente operativo:
$$A_{op} = \langle S, \mathcal{Q}, \Sigma, \delta_{trans}, q_{sleep}, \{q_{halt}\} \rangle$$

### [02. Spazio degli Stati ($S$)](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/02_state_space.md)
Formalizza la 6-upla di stato $S = \langle I, M_s, D_s, T_a, K_a, E_p \rangle$. Stabilisce il principio di immutabilità endogena (l'agente non può alterare arbitrariamente le proprie componenti statiche dall'interno) e di mutabilità esogena (operatori esterni o l'ambiente possono applicare transizioni di stato $S' = S \oplus_{ext} \Delta S$ durante le pause di quiete).

### [03. Automa a Stati Finiti ($\mathcal{M}_{FSM}$)](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/03_fsm_states.md)
Definisce l'insieme discreto di controllo $\mathcal{Q} = \{ q_{sleep}, q_{exec}, q_{yield}, q_{repair}, q_{halt} \}$, il diagramma di transizione, gli invarianti di sicurezza e le condizioni necessarie e sufficienti per ogni cambio di stato.

### [04. Spazio delle Azioni ($\Sigma$) e Funzione di Visibilità ($\mathcal{V}_\Omega$)](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/04_action_space.md)
Classifica le azioni in azioni sul mondo ($T_a$), contratti di terminazione tipizzati ($A_{term}$) e azioni di recupero ($a_{abort\_call}$). Definisce la funzione dinamica $\mathcal{V}_\Omega(q)$ che isola rigorosamente le capacità disponibili al modello in base allo stato attivo della FSM.

### [05. Tripla di Inferenza ($\mathcal{C}_\Omega$) e Frame di Sistema](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/05_inference_triple.md)
Formalizza la proiezione $\mathcal{F}_\Omega(S)$ dello stato $S$ nel canale di sistema e la composizione della tripla $\mathcal{C}_\Omega = \langle \mathcal{F}_\Omega(S), E_p, \mathcal{V}_\Omega(q) \rangle$ inoltrata al trasduttore neurale $\mathbb{M}$.

### [06. Ontologia degli Eventi Epistemici e Traccia Episodica](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/06_message_ontology.md)
Formalizza la struttura atomica degli eventi $e = \langle \tau, \text{type}, \mu, id \rangle$, lo spazio discreto dei tipi di evento $\mathcal{T}_{event} = \{\text{stimulus}, \text{thought}, \text{action}, \text{result}\}$, gli invarianti della traccia episodica e il protocollo di notifica degli errori su tipo `result`.

### [07. Meccanica delle Transizioni e Ciclo Esecutivo](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/07_transitions_and_execution.md)
Descrive la semantica esecutiva: ricezione dell'input utente, ciclo iterativo di esecuzione, dispatching sincrono e parallelo delle chiamate a tool nel mondo fisico, e raggiungimento dell'arresto tipizzato $q_{halt}$.

### [08. L'Architettura Componibile a 3 Livelli](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization_v2/08_architecture_levels.md)
Formalizza la separazione ortogonale a 3 livelli: Livello 1 (Framework ed esecuzione $\Omega_{op}$ con i suoi parametri di runtime), Livello 2 (Mondo fisico $W$ con implementazioni reali dei tool), e Livello 3 (L'Agente $A_{op}$ specificato da identità, missione, dati operativi, toolbelt attivo $T_a \subseteq W$, concetti e contratti di terminazione).

