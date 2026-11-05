# 1.5 Le Direttive di Controllo del Framework ($\Delta$)

Questo documento fornisce la **definizione formale, algebrica e contrattuale** delle direttive epistemiche di sistema generate dall'Orchestratore $\Omega$.

---

## 1. Natura Ontologica di una Direttiva

> **Definizione**: Una direttiva $\delta \in \Delta$ non è un'azione né un tool eseguibile dall'agente, ma un **segnale epistemico di controllo eteronomo** iniettato da $\Omega$ nel Flusso di Coscienza $E_p$ con ruolo $\pi_\Omega$ (massima autorità). Ha lo scopo di forzare la modalità computazionale del Modello di Ragionamento e definirne lo spazio di ammissibilità delle uscite al passo corrente.

Formalmente, l'universo delle direttive è:

$$\Delta = \{ \delta_{start\_intro}, \ \delta_{loop\_intro}, \ \delta_{start\_exec}, \ \delta_{err\_schema} \}$$

Ogni elemento $\delta \in \Delta$ è formalizzato come la quadrupla tipizzata:

$$\delta = \langle \tau, \pi_\Omega, \mathcal{R}_{allowed}, \Psi_{prompt} \rangle$$

Dove:
* $\tau$: Il tipo/fase computazionale dell'automa.
* $\pi_\Omega$: Il ruolo epistemico forzato dell'Orchestratore (vedi [message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md)), a prova di falsificazione e prompt injection.
* $\mathcal{R}_{allowed}$: L'insieme delle azioni che $\Omega$ accetta di ricevere dal modello al passo conseguente.
* $\Psi_{prompt}$: Il contratto semantico e linguistico vincolante.

---

## 2. Specifiche delle Singole Direttive

### 2.1 $\delta_{start\_intro}$ (Inizializzazione Introspettiva)

* **Generatore**: $\Omega$ (all'attivazione del Caso A della funzione router $G_\Omega$).
* **Condizione di Trigger**:
  $$P_t \text{ ricevuto} \quad \land \quad A_{int} \neq \emptyset$$
* **Stato risultante**:
  $$s_0 = S_{t-1} \oplus P_t \oplus \delta_{start\_intro}$$
* **Spazio di Uscita Consentito**:
  $$\mathcal{R}_{allowed} = A_{int} \cup \{ a_{concludi\_intro} \}$$
* **Invariante di Isolamento**:
  $$\mathcal{R}_{allowed} \cap (T_a \cup A_{term}) = \emptyset$$
  *(Nessuna azione sul mondo fisico o di terminazione è ammissibile).*
* **Contratto Semantico ($\Psi_{prompt}$)**:
  > *"Hai ricevuto un nuovo evento dal mondo ($P_t$). L'accesso al mondo esterno è temporaneamente bloccato. Esamina il tuo stato interno e i tuoi obiettivi di missione. Modifica il tuo stato interno tramite i tool cognitivi concessi ($A_{int}$) oppure, se ritieni la tua configurazione già allineata all'evidenza, emetti $a_{concludi\_intro}$."*

---

### 2.2 $\delta_{loop\_intro}$ (Feedback e Avanzamento del Micro-Step)

* **Generatore**: $\Omega$ al completamento del micro-step cognitivo $k$, quando l'agente non ha ancora emesso l'azione di arresto ($X_k \subseteq A_{int} \land X_k \neq \emptyset$).
* **Condizione di Trigger**:
  $$X_k \text{ validato ed eseguito con successo} \implies \text{generati risultati } R_k$$
* **Stato risultante**:
  $$s_{k+1} = s_k \oplus R_k \oplus \delta_{loop\_intro}$$
* **Spazio di Uscita Consentito**:
  $$\mathcal{R}_{allowed} = A_{int} \cup \{ a_{concludi\_intro} \}$$
* **Contratto Semantico ($\Psi_{prompt}$)**:
  > *"Le modifiche introspettive $X_k$ sono state applicate allo stato interno con esito $R_k$. Valuta se occorrono ulteriori raffinamenti cognitivi o se emettere $a_{concludi\_intro}$ per avviare la fase esecutiva."*

---

### 2.3 $\delta_{start\_exec}$ (Transizione all'Esecuzione Esterna)

* **Generatore**: $\Omega$ alla chiusura certificata della Fase 1 (oppure direttamente dal Caso B di $G_\Omega$ per agenti reattivi).
* **Condizione di Trigger**:
  $$(X_k = \{ a_{concludi\_intro} \}) \quad \lor \quad (A_{int} = \emptyset)$$
* **Stato risultante**:
  $$S_{t, exec} = S_t \oplus \delta_{start\_exec}$$
* **Spazio di Uscita Consentito**:
  $$\mathcal{R}_{allowed} = T_a \cup A_{term}$$
* **Invariante di Sigillatura Cognitiva**:
  $$\mathcal{R}_{allowed} \cap A_{int} = \emptyset$$
  *(Tutti i tool introspettivi sono stati revocati da $\Omega$. L'agente non può più mutare memoria in questa fase).*
* **Contratto Semantico ($\Psi_{prompt}$)**:
  > *"La fase introspettiva è sigillata e il macro-stato è consolidato. Hai accesso esclusivo ai tool fisici operativi ($T_a$) e ai contratti di uscita ($A_{term}$). Emetti una o più azioni sul mondo (Yield) o termina il processo (Halt)."*

---

### 2.4 $\delta_{err\_schema}$ (Riparazione Guidata da Errore di Tipo)

* **Generatore**: $\Omega$ in caso di violazione formale di tipo (es. $Y = \{ a_{term\_i}(payload) \}$ dove $payload \not\models \sigma_i$).
* **Condizione di Trigger**:
  $$\exists y \in Y \text{ tale che } \text{valida}(y, \sigma) = \text{False}$$
* **Spazio di Uscita Consentito**: Identico alla fase in cui è avvenuto l'errore.
* **Contratto Semantico ($\Psi_{prompt}$)**:
  > *"Il payload emesso ha violato la firma contrattuale attesa $\sigma$. Correggi i campi invalidi rispettando rigorosamente la specifica dello schema fornito."*

---

## 3. Principio Universale dello Stimolo-Risposta Epistemico

Ogni direttiva $\delta \in \Delta$ immessa da $\Omega$ funge da stimolo transizionale per il Modello di Ragionamento. A fronte di **qualsiasi** direttiva iniettata, la risposta generata dall'agente presenta sempre la medesima struttura duale:

$$\text{Risposta}(\delta) = \langle \text{thought}^?, \ \mathcal{A}_{calls} \rangle$$

Dove:
1. **Riflessione Interna ($\text{thought}^?$)**: Blocco opzionale di monologo interiore / Chain-of-Thought generato spontaneamente dal modello prima di selezionare l'azione. Se non vuoto ($\mu_{thought} \neq \emptyset$), $\Omega$ accoda deterministicamente:
   $$e_{thought} = \langle t_k, \pi_{agent}, \text{thought}, \mu_{thought}, \emptyset \rangle$$
2. **Vettore di Chiamate ad Azioni ($\mathcal{A}_{calls}$)**: L'emissione formale di una o più azioni vincolate allo spazio $\mathcal{R}_{allowed}$ prescritto da $\delta$. Per ogni azione emessa viene accodato:
   $$e_{call, i} = \langle t_k, \pi_{agent}, \text{call}, a_i, id_i \rangle$$

Questo schema si applica uniformemente a tutte le 4 direttive:
* **Dopo $\delta_{start\_intro}$**: riflessione iniziale sullo stato + emissione di $X_0 \subseteq A_{int}$ (o chiusura).
* **Dopo $\delta_{loop\_intro}$**: riflessione sui risultati cognitivi $R_k$ + emissione del passo successivo $X_k$ (o chiusura).
* **Dopo $\delta_{start\_exec}$**: pianificazione dell'interazione fisica + emissione di $Y \subseteq T_a$ (Yield) o $a_{term}$ (Halt).
* **Dopo $\delta_{err\_schema}$**: analisi della violazione sintattica + riemissione del payload corretto.

---

## 4. Tabella Riassuntiva delle Proprietà delle Direttive

| Direttiva | Fase | Trigger | $\mathcal{R}_{allowed}$ | Azioni sul Mondo $W$? | Modifica Memoria? |
| :--- | :--- | :--- | :--- | :---: | :---: |
| $\delta_{start\_intro}$ | Inizio $\Phi_{intro}$ | $P_t$ e $A_{int} \neq \emptyset$ | $A_{int} \cup \{ a_{concludi\_intro} \}$ | ❌ No | ✅ Sì |
| $\delta_{loop\_intro}$ | Passo $k+1$ in $\Phi_{intro}$ | Esecuzione $R_k$ | $A_{int} \cup \{ a_{concludi\_intro} \}$ | ❌ No | ✅ Sì |
| $\delta_{start\_exec}$ | Inizio $\Phi_{exec}$ | $a_{concludi\_intro}$ o $A_{int}=\emptyset$ | $T_a \cup A_{term}$ | ✅ Sì | ❌ No |
| $\delta_{err\_schema}$ | Qualsiasi loop | Rigetto schema $\not\models \sigma$ | Confinato alla fase corrente | Dipende dalla fase | Dipende dalla fase |

