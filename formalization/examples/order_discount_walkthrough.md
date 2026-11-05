# Traccia di Esecuzione Completa (Transcript Formato Chat & Triple di Inferenza)

Questo documento illustra un'esecuzione reale e deterministica del sistema agentico, mostrando per **ciascuna attivazione dell'agente**:
1. **La Tripla Fondamentale di Inferenza esatta inviata all'LLM**:
   $$\mathcal{C}_\Omega(\delta, S) = \Big\langle \mathcal{F}_\Omega(\delta, S) \ [\text{System}], \quad E_p \ [\text{Messages}], \quad \mathcal{V}_\Omega(\delta, S) \ [\text{Tools}] \Big\rangle$$
2. **La risposta del Modello**: pensiero opzionale (`thought`) e chiamate (`call`).
3. **Le transizioni formali governate dall'Orchestratore $\Omega$**.

Il vincolo **XOR** di $\Phi_{intro}$ ($X_k \subseteq A_{int} \ \veebar \ X_k = \{ a_{concludi\_intro} \}$) e il router $G_\Omega$ (ingresso obbligatorio in $\Phi_{intro}$ a **ogni risveglio da Yield**) sono rigorosamente rispettati.

---

## 🏢 Scenario di Business
L'utente invia la richiesta commerciale:
> *"Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€."*

* **Mondo $W$**:
  * $w_{db\_ordini}$: `(cliente_id: int) -> { ordine_id: string, totale: float, stato: string }`
  * $w_{applica\_sconto}$: `(ordine_id: string, percentuale: float) -> { nuovo_totale: float, esito: string }`
* **Archivio $\mathcal{U}_{knowledge}$**:
  * $c_{sconti} = \langle \text{"pol\_sconti\_2026"}, \text{"Regole sconti clienti VIP"}, \text{"Se il totale preventivo supera 150€, applicare sconto fisso del 15%."} \rangle$
* **Configurazione Iniziale $S_0$**:
  * $I = \text{"Sei l'Assistente Commerciale Aziendale. Applica le policy in modo rigoroso."}$
  * $M_{s0} = \text{"In attesa di richieste da elaborare"}$
  * $D_{s0} = \{ \text{"anno\_fiscale"}: 2026 \}$
  * $T_{a0} = \emptyset$
  * $K_{a0} = \emptyset$
  * $E_{p0} = []$
* **Permessi Cognitivi $A_{int}$**:
  $$A_{int} = \{ \text{aggiorna\_missione}, \text{imposta\_dato}, \text{elimina\_dato}, \text{cerca\_tool}, \text{carica\_tool}, \text{scarica\_tool}, \text{cerca\_concetti}, \text{carica\_concetto}, \text{scarica\_concetto}, \text{compatta\_memoria} \}$$
* **Contratti di Terminazione $A_{term}$**:
  * $a_{successo}(\sigma_{ordine\_concluso})$ dove $\sigma = \{ \text{ordine\_id}: \text{string}, \text{totale\_finale}: \text{float}, \text{sconto\_applicato}: \text{float} \}$

---

## 1. MACRO-CICLO $c=0$: Ricezione Richiesta, Introspezione e Primo Tool Fisico

### Evento Iniziale
L'utente invia $P_0$.
L'automa passa da $q_{sleep} \to q_{router}$. Poiché $A_{int} \neq \emptyset$, il router $G_\Omega$ seleziona il **Caso A** e instarda l'automa in $q_{intro}$, iniettando $\delta_{start\_intro}$.

---

### Step 1: Introspezione — Esplorazione ($\tau = \langle 0, 0 \rangle$)

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_intro}, S_0)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**
  ```markdown
  # IDENTITÀ (I)
  Sei l'Assistente Commerciale Aziendale. Applica le policy in modo rigoroso.

  # MISSIONE CORRENTE (M_s)
  In attesa di richieste da elaborare

  # DATI STRUTTURATI (D_s)
  { "anno_fiscale": 2026 }

  # CONCETTI ATTIVI (K_a)
  (Nessun concetto caricato)

  # TOOL FISICI NEL TOOLBELT (T_a)
  (Nessun tool montato)
  ```
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**
  ```json
  [
    {
      "tau": [0, 0],
      "role": "user",
      "channel": "payload",
      "content": "Il cliente Mario Rossi (ID: 55) richiede l'applicazione dello sconto speciale sul suo ultimo preventivo di 200€."
    },
    {
      "tau": [0, 0],
      "role": "orchestrator",
      "channel": "directive",
      "content": "δ_start_intro: Accesso al mondo esterno bloccato. Esamina il tuo stato interno e prepara le risorse necessarie."
    }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$ (Tools)**
  ```
  A_int ∪ { a_concludi_intro } = [
    aggiorna_missione, imposta_dato, elimina_dato, cerca_tool, carica_tool, 
    scarica_tool, cerca_concetti, carica_concetto, scarica_concetto, 
    compatta_memoria, a_concludi_intro
  ]
  ```

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Ho ricevuto una richiesta di sconto per il cliente 55. Prima di operare devo recuperare la policy sconti aziendale e cercare i tool per accedere ai preventivi e applicare riduzioni."*
* ⚡ **`call`** *(XOR Sottocaso 1: $X_k \subseteq A_{int}$)*:
  - `cerca_concetti(query="sconti clienti")` $\to$ *(id: `call_c1`)*
  - `cerca_tool(query="ordini")` $\to$ *(id: `call_t1`)*

---

### Step 2: Introspezione — Commit Risorse e Aggiornamento Missione ($\tau = \langle 0, 1 \rangle$)

$\Omega$ esegue la ricerca passiva tramite $\mathcal{T}_\Omega$, accoda i risultati e inietta $\delta_{loop\_intro}$. Il tick avanza a $t=1$.

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{loop\_intro}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Invariato rispetto a prima.
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**:
  *(I messaggi precedenti più le chiamate e i relativi risultati)*:
  ```json
  [
    ... (messaggi precedenti) ...,
    { "tau": [0, 0], "role": "agent", "channel": "call", "id": "call_c1", "content": "cerca_concetti(query='sconti clienti')" },
    { "tau": [0, 0], "role": "agent", "channel": "call", "id": "call_t1", "content": "cerca_tool(query='ordini')" },
    { "tau": [0, 1], "role": "orchestrator", "channel": "result", "id": "call_c1", "content": "[{ id: 'pol_sconti_2026', descrizione: 'Regole sconti clienti VIP' }]" },
    { "tau": [0, 1], "role": "orchestrator", "channel": "result", "id": "call_t1", "content": "[{ id: 'w_db_ordini', desc: 'Database ordini e preventivi' }, { id: 'w_applica_sconto', desc: 'Modifica totale ordine applicando percentuale' }]" },
    { "tau": [0, 1], "role": "orchestrator", "channel": "directive", "content": "δ_loop_intro: Modifiche applicate. Procedi con altre azioni introspettive o concludi." }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"La policy 'pol_sconti_2026' è rilevante. I tool trovati sono esattamente ciò di cui ho bisogno. Carico la policy in memoria di lavoro, monto entrambi i tool nel toolbelt e aggiorno la missione."*
* ⚡ **`call`** *(XOR Sottocaso 1: $X_k \subseteq A_{int}$)*:
  - `aggiorna_missione("Verificare preventivo del cliente 55 e applicare sconto secondo policy VIP")`
  - `carica_concetto(concetto_ids=["pol_sconti_2026"])`
  - `carica_tool(tool_ids=["w_db_ordini", "w_applica_sconto"])`

---

### Step 3: Introspezione — Convergenza Epistemologica ($\tau = \langle 0, 2 \rangle$)

$\Omega$ applica le mutazioni tramite $\mathcal{T}_\Omega$:
- $M_s \leftarrow \text{"Verificare preventivo..."}$
- $K_a \leftarrow \{ c_{sconti} \}$
- $T_a \leftarrow \{ w_{db\_ordini}, w_{applica\_sconto} \}$
Inietta $\delta_{loop\_intro}$ ($t \leftarrow 2$).

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{loop\_intro}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$** *(Nota: Riflette istantaneamente lo stato aggiornato!)*:
  ```markdown
  # IDENTITÀ (I)
  Sei l'Assistente Commerciale Aziendale. Applica le policy in modo rigoroso.

  # MISSIONE CORRENTE (M_s)
  Verificare preventivo del cliente 55 e applicare sconto secondo policy VIP

  # DATI STRUTTURATI (D_s)
  { "anno_fiscale": 2026 }

  # CONCETTI ATTIVI (K_a)
  --- CONCETTO: pol_sconti_2026 ---
  Se il totale preventivo supera 150€, applicare sconto fisso del 15%.

  # TOOL FISICI NEL TOOLBELT (T_a)
  - w_db_ordini
  - w_applica_sconto
  ```
* **Canale 2: Flusso di Coscienza $E_p$**: Riporta i risultati positivi di aggiornamento missione, caricamento concetto e tool, seguiti da $\delta_{loop\_intro}$.
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"La missione è allineata, la policy sconti è presente a testo pieno nel mio frame e i tool necessari sono montati. La mia mente è pronta: chiudo l'introspezione."*
* ⚡ **`call`** *(XOR Sottocaso 2: Convergenza Singola)*:
  - `a_concludi_intro()`

---

### Step 4: Fase Esecutiva — Interrogazione del Database e Yield ($\tau = \langle 0, 3 \rangle$)

$\Omega$ valida $a_{concludi\_intro}$. Transizione $q_{intro} \to q_{exec}$.
$\Omega$ revoca tutti i permessi cognitivi $A_{int}$, sblocca i tool fisici montati e inietta $\delta_{start\_exec}$ ($t \leftarrow 3$).

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_exec}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Identità $I$, Missione $M_s$, Dati $D_s$, Concetto $K_a$ a testo pieno. (I descrittori di $T_a$ sono omessi qui perché già definiti in $\mathcal{V}_\Omega$).
* **Canale 2: Flusso di Coscienza $E_p$**:
  In coda contiene:
  ```json
  { "tau": [0, 2], "role": "agent", "channel": "call", "id": "call_close", "content": "a_concludi_intro()" },
  { "tau": [0, 3], "role": "orchestrator", "channel": "directive", "content": "δ_start_exec: Introspezione conclusa. Mente sigillata. Procedi ad agire sul mondo (T_a) o termina (A_term)." }
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$ (Tools)**:
  ```
  T_a ∪ A_term = [
    w_db_ordini,
    w_applica_sconto,
    a_successo
  ]
  ```

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Ora devo verificare il preventivo reale del cliente Mario Rossi (ID 55) interrogando il database ordini."*
* ⚡ **`call`** *(Sottocaso 1: $Y \subseteq T_a$)*:
  - `w_db_ordini(cliente_id=55)` $\to$ *(id: `call_db_1`)*

#### ⚙️ Transizione dell'Orchestratore $\Omega$:
- Registra $e_{call}$ in $E_p$.
- **YIELD & IBERNAZIONE**: Transita da $q_{exec} \to q_{yield} \to q_{sleep}$.
- Lancia asincronamente $w_{db\_ordini}$ verso il Mondo $W$.
- Il macro-ciclo del mondo avanza a **$c = 1$**.

---

## 2. MACRO-CICLO $c=1$: Risveglio dal Mondo, Introspezione Obbligatoria e Secondo Tool

### Risveglio dal Mondo
Il Mondo $W$ completa l'operazione e restituisce:
$$\{ \text{ordine\_id}: \text{"ORD-99"}, \ \text{totale}: 200.0, \ \text{stato}: \text{"PREVENTIVO"} \}$$
L'evento esterno genera il nuovo Payload $P_1$ contenente il risultato collegato a `call_db_1`.
L'automa passa da $q_{sleep} \to q_{router}$.
**Poiché $A_{int} \neq \emptyset$, il router $G_\Omega$ DEVE entrare obbligatoriamente in $q_{intro}$ con $\delta_{start\_intro}$!**

---

### Step 5: Introspezione — Memorizzazione Dato del Mondo ($\tau = \langle 1, 4 \rangle$)

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_intro}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Mostra $I$, $M_s$, $D_s$, $K_a$ e $T_a$.
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**:
  Contiene i nuovi messaggi del mondo:
  ```json
  [
    ... (messaggi precedenti) ...,
    { "tau": [1, 4], "role": "world", "channel": "result", "id": "call_db_1", "content": "{ ordine_id: 'ORD-99', totale: 200.0, stato: 'PREVENTIVO' }" },
    { "tau": [1, 4], "role": "orchestrator", "channel": "directive", "content": "δ_start_intro: Nuovo evento dal mondo ricevuto. Esamina i dati e allinea lo stato prima di agire." }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Ho ricevuto i dati del preventivo: l'ID è ORD-99 e il totale è 200.0€. Salvo queste informazioni chiave nella mia memoria di lavoro strutturata D_s tramite imposta_dato."*
* ⚡ **`call`** *(XOR Sottocaso 1: $X_k \subseteq A_{int}$ — NON chiude ancora!)*:
  - `imposta_dato(chiave="preventivo_corrente", valore={ "ordine_id": "ORD-99", "totale": 200.0 })`

---

### Step 6: Introspezione — Chiusura Post-Dato ($\tau = \langle 1, 5 \rangle$)

$\Omega$ applica $\mathcal{T}_\Omega$: aggiorna $D_s \leftarrow D_s \cup \{ \text{"preventivo\_corrente"}: \dots \}$. Inietta $\delta_{loop\_intro}$ ($t \leftarrow 5$).

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{loop\_intro}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**:
  In `# DATI STRUTTURATI (D_s)` compare ora il nuovo record `preventivo_corrente`.
* **Canale 2: Flusso di Coscienza $E_p$**: Risultato di `imposta_dato` + $\delta_{loop\_intro}$.
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Dato memorizzato. Lo stato è perfettamente coerente. Concludo l'introspezione."*
* ⚡ **`call`** *(XOR Sottocaso 2: Convergenza Singola)*:
  - `a_concludi_intro()`

---

### Step 7: Fase Esecutiva — Applicazione Sconto e Secondo Yield ($\tau = \langle 1, 6 \rangle$)

$\Omega$ valida $a_{concludi\_intro}$, revoca $A_{int}$, rende visibile $T_a \cup A_{term}$ e inietta $\delta_{start\_exec}$ ($t \leftarrow 6$).

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_exec}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Mostra $I$, $M_s$, $D_s$ (con `preventivo_corrente`), $K_a$ (policy sconti > 150€ $\implies$ 15%).
* **Canale 2: Flusso di Coscienza $E_p$**: Chiude l'introspezione e inietta $\delta_{start\_exec}$.
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $\{ w_{db\_ordini}, w_{applica\_sconto}, a_{successo} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Il totale è 200.0€, quindi supera la soglia di 150€ stabilita dalla policy pol_sconti_2026. Devo applicare uno sconto del 15% sull'ordine ORD-99."*
* ⚡ **`call`** *(Sottocaso 1: $Y \subseteq T_a$)*:
  - `w_applica_sconto(ordine_id="ORD-99", percentuale=15.0)` $\to$ *(id: `call_disc_1`)*

#### ⚙️ Transizione dell'Orchestratore $\Omega$:
- Registra $e_{call}$ in $E_p$.
- **YIELD & IBERNAZIONE**: Transita da $q_{exec} \to q_{yield} \to q_{sleep}$.
- Lancia asincronamente $w_{applica\_sconto}$ verso $W$.
- Il macro-ciclo avanza a **$c = 2$**.

---

## 3. MACRO-CICLO $c=2$: Risveglio Finale, Introspezione e Halt Definitivo

### Risveglio dal Mondo
Il Mondo $W$ completa l'aggiornamento e restituisce:
$$\{ \text{nuovo\_totale}: 170.0, \ \text{esito}: \text{"APPLICATO"} \}$$
Arriva $P_2$. L'automa passa da $q_{sleep} \to q_{router}$.
**Ancora una volta, $G_\Omega$ instarda in $q_{intro}$ con $\delta_{start\_intro}$.**

---

### Step 8: Introspezione — Valutazione Esito Finale ($\tau = \langle 2, 7 \rangle$)

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_intro}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Mostra lo stato corrente.
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**:
  Contiene l'esito dello sconto dal mondo:
  ```json
  [
    ... (messaggi precedenti) ...,
    { "tau": [2, 7], "role": "world", "channel": "result", "id": "call_disc_1", "content": "{ nuovo_totale: 170.0, esito: 'APPLICATO' }" },
    { "tau": [2, 7], "role": "orchestrator", "channel": "directive", "content": "δ_start_intro: Nuovo evento dal mondo ricevuto. Esamina i dati e allinea lo stato." }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"L'esito 'APPLICATO' con nuovo totale 170.0€ conferma che l'operazione ha avuto successo. Non ho bisogno di modificare memoria o concetti; sono pronto per l'uscita."*
* ⚡ **`call`** *(XOR Sottocaso 2: Convergenza Singola Immediata)*:
  - `a_concludi_intro()`

---

### Step 9: Fase Esecutiva — Halt Definitivo ($\tau = \langle 2, 8 \rangle$)

$\Omega$ valida $a_{concludi\_intro}$, transita a $q_{exec}$, revoca $A_{int}$, sblocca $T_a \cup A_{term}$ e inietta $\delta_{start\_exec}$ ($t \leftarrow 8$).

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_exec}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**: Stato consolidato.
* **Canale 2: Flusso di Coscienza $E_p$**: Chiude l'introspezione e inietta $\delta_{start\_exec}$.
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**: $\{ w_{db\_ordini}, w_{applica\_sconto}, a_{successo} \}$.

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"La missione è completata al 100%. Emetto il contratto di uscita terminale tipizzato a_successo con tutti i dati richiesti dallo schema."*
* ⚡ **`call`** *(Sottocaso 2: Terminazione Tipizzata)*:
  - `a_successo({ ordine_id: "ORD-99", totale_finale: 170.0, sconto_applicato: 15.0 })`

---

### 🛑 Transizione Finale: HALT e Consegna del Risultato

1. **Validazione di $\Omega$**:
   - Verifica: $a_{successo} \in A_{term}$ $\implies \text{True}$.
   - Verifica: $payload \models \sigma_{ordine\_concluso}$ $\implies \text{True}$.
2. **Arresto Secco**:
   - L'automa transita in **$q_{halt}$**.
   - Nessun messaggio viene aggiunto a $E_p$.
   - Il processo dell'agente si estingue e rilascia la memoria.
3. **Tagged Union emessa verso l'Utente / Infrastruttura**:
   ```json
   {
     "type": "a_successo",
     "payload": {
       "ordine_id": "ORD-99",
       "totale_finale": 170.0,
       "sconto_applicato": 15.0
     }
   }
   ```
