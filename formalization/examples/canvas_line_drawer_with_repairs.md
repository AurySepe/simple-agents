# Esempio Operativo Avanzato: Disegnatore su Tela con Errore di Schema e Compattazione

Questo documento illustra un'esecuzione complessa e iterativa del sistema agentico, mostrando in azione:
1. **L'autonomia di pianificazione in $\Phi_{intro}$** per calcolare una traiettoria geometrica.
2. **L'intercettazione di un errore sintattico di schema**, l'ingresso nello stato speciale **$q_{repair}$** e la risoluzione guidata da **$\delta_{err\_schema}$**.
3. **La compattazione della memoria ($E_p$)** tramite la primitiva SOTA **`compatta_memoria`** per comprimere le chiamate intermedie prima della conclusione.
4. **L'Halt finale** con restituzione del risultato tipizzato.

---

## 🏢 Scenario di Business
L'utente invia la richiesta:
> *"Disegna un triangolo equilatero chiuso sulla tela digitale con base da (0,0) a (10,0) e vertice in (5, 8.66). Usa colore nero."*

Il Mondo $W$ espone un unico tool fisico atomico:
* $w_{disegna\_linea}$:
  $$\sigma_{in} = \{ \text{x1}: \text{float}, \ \text{y1}: \text{float}, \ \text{x2}: \text{float}, \ \text{y2}: \text{float}, \ \text{colore}: \text{string} \}$$
  $$\sigma_{out} = \{ \text{linea\_id}: \text{string}, \ \text{stato}: \text{"DISEGNATA"} \}$$

---

## 1. Condizioni Iniziali del Sistema

* **Stato Iniziale dell'Agente ($S_0$)**:
  * $I = \text{"Sei l'Agente Grafico. Traccia figure geometriche chiuse rispettando le coordinate."}$
  * $M_{s0} = \text{"In attesa di istruzioni grafiche"}$
  * $D_{s0} = \emptyset$
  * $T_{a0} = \{ w_{disegna\_linea} \}$ *(tool già pre-caricato nel toolbelt)*
  * $K_{a0} = \emptyset$
  * $E_{p0} = []$
* **Permessi Cognitivi ($A_{int}$)**:
  $$A_{int} = \{ \text{aggiorna\_missione}, \text{imposta\_dato}, \text{elimina\_dato}, \text{compatta\_memoria} \}$$
* **Contratti di Terminazione ($A_{term}$)**:
  * $a_{disegno\_completato}(\sigma_{esito})$ dove:
    $$\sigma_{esito} = \{ \text{figura}: \text{"TRIANGOLO"}, \ \text{numero\_linee}: \text{int}, \ \text{chiusa}: \text{bool} \}$$

---

## 2. Trascrizione Chat & Triple di Inferenza

---

### CICLO $c=0$: Introspezione e Prima Linea (Base del Triangolo)

#### Innesco
L'utente invia $P_0$ con la richiesta di disegnare il triangolo.
$G_\Omega$ rileva $A_{int} \neq \emptyset \implies$ entra in $q_{intro}$ con $\delta_{start\_intro}$.

#### Step 1: Introspezione — Pianificazione dei Vertici ($\tau = \langle 0, 0 \rangle$)
* **System Frame $\mathcal{F}_\Omega$**: Mostra $I$, $M_{s0}$, $D_s = \emptyset$, $T_a = \{w_{disegna\_linea}\}$.
* **Messages $E_p$**: $[e_{user}(P_0), \ e_\delta(\delta_{start\_intro})]$.
* **Tools $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Devo disegnare un triangolo equilatero. Salvo le 3 linee da tracciare nei dati strutturati per monitorare l'avanzamento, poi chiuderò l'introspezione."*
* ⚡ **`call`** *(XOR Sottocaso 1: $X_k \subseteq A_{int}$)*:
  - `imposta_dato(chiave="linee_rimaste", valore=["L1: (0,0)->(10,0)", "L2: (10,0)->(5,8.66)", "L3: (5,8.66)->(0,0)"])`

---

#### Step 2: Introspezione — Chiusura ($\tau = \langle 0, 1 \rangle$)
$\Omega$ aggiorna $D_s$ con la lista delle linee e inietta $\delta_{loop\_intro}$ ($t \leftarrow 1$).

* **System Frame $\mathcal{F}_\Omega$**: In $D_s$ compare la lista `linee_rimaste`.
* **Tools $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Piano impostato. Concludo l'introspezione per iniziare a disegnare."*
* ⚡ **`call`** *(XOR Sottocaso 2: Chiusura Singola)*:
  - `a_concludi_intro()`

---

#### Step 3: Fase Esecutiva — Tracciamento Linea 1 ($\tau = \langle 0, 2 \rangle$)
$\Omega$ valida la chiusura, transita a $q_{exec}$, revoca $A_{int}$ e inietta $\delta_{start\_exec}$ ($t \leftarrow 2$).
* **Tools $\mathcal{V}_\Omega$**: $\{ w_{disegna\_linea}, a_{disegno\_completato} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Traccio la prima linea (la base) da (0,0) a (10,0) con colore nero."*
* ⚡ **`call`**:
  - `w_disegna_linea(x1=0.0, y1=0.0, x2=10.0, y2=0.0, colore="nero")` $\to$ *(id: `call_l1`)*

**Orchestratore $\Omega$**:
* **Yield & Ibernazione**: Transita a $q_{sleep}$. Invia a $W$. Il macro-ciclo avanza a **$c=1$**.

---

### CICLO $c=1$: Errore di Schema, Stato $q_{repair}$ e Correzione della Linea 2

#### Risveglio dal Mondo
$W$ restituisce: `{ linea_id: "L1", stato: "DISEGNATA" }`.
Arriva $P_1$. $G_\Omega$ invia l'automa in $q_{intro}$ con $\delta_{start\_intro}$.

#### Step 4: Introspezione Rapida di Verifica ($\tau = \langle 1, 3 \rangle$)
* **System Frame $\mathcal{F}_\Omega$**: Stato corrente.
* **Messages $E_p$**: Risultato L1 confermato dal mondo.
* **Tools $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"La linea 1 è tracciata. Procedo subito alla fase esecutiva per la linea 2."*
* ⚡ **`call`**: `a_concludi_intro()`

---

#### Step 5: Fase Esecutiva con Errore di Schema ($\tau = \langle 1, 4 \rangle$)
$\Omega$ transita a $q_{exec}$ e inietta $\delta_{start\_exec}$ ($t \leftarrow 4$).
* **Tools $\mathcal{V}_\Omega$**: $\{ w_{disegna\_linea}, a_{disegno\_completato} \}$.

**Risposta del Modello $\mathbb{M}$ (Chiamata Invalida)**:
* 💭 **`thought`**: *"Ora traccio il secondo lato dal vertice (10,0) a (5, 8.66)."*
* ⚡ **`call`**:
  - `w_disegna_linea(x1="dieci", y1=0.0, x2=5.0, y2=8.66)`  
    *(⚠️ ERRORE: `x1` passato come stringa invece di float; manca il parametro obbligatorio `colore`!)*

#### ⚙️ Intercettazione di $\Omega$ e Transizione a $q_{repair}$:
- $\Omega$ valida il payload rispetto a $\sigma_{in}$:
  $$\text{Valido} = \text{False} \quad (\text{Tipo errato su } x_1, \ \text{campo mancante } colore)$$
- **L'azione non viene inviata al Mondo $W$** (protezione d'integrità).
- $\Omega$ transita nello stato speciale **$q_{repair}$**.
- La maschera di visibilità si restringe rigidamente alle sole due scelte:
  $$\mathcal{V}_\Omega = \{ w_{disegna\_linea}, \ a_{abort\_call} \}$$
- $\Omega$ inietta la direttiva di correzione: $\delta_{err\_schema}$.

---

#### Step 6: Stato $q_{repair}$ — Correzione Guidata dello Schema ($\tau = \langle 1, 5 \rangle$)

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{err\_schema}, S)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**
  ```markdown
  # IDENTITÀ (I)
  Sei l'Agente Grafico. Traccia figure geometriche chiuse rispettando le coordinate.

  # ERRORE DI SCHEMA RILEVATO (DIAGNOSTICA)
  Tool fallito: w_disegna_linea
  - Campo 'x1': atteso tipo float, ricevuta stringa 'dieci'.
  - Campo 'colore': parametro obbligatorio mancante.
  Specifica formale: { x1: float, y1: float, x2: float, y2: float, colore: string }
  ```
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**
  ```json
  [
    ... (messaggi precedenti) ...,
    { "tau": [1, 4], "role": "agent", "channel": "call", "id": "call_err_1", "content": "w_disegna_linea(x1='dieci', y1=0.0, x2=5.0, y2=8.66)" },
    { "tau": [1, 5], "role": "orchestrator", "channel": "directive", "content": "δ_err_schema: Parametri non validi. Correggi la chiamata secondo lo schema fornito oppure rinuncia con a_abort_call." }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$**
  ```
  V_Ω = [
    w_disegna_linea,
    a_abort_call
  ]
  ```

#### 📤 Risposta del Modello $\mathbb{M}$ (Riparazione Effettuata):
* 💭 **`thought`**: *"Ho commesso due errori di schema: x1 deve essere il numero float 10.0 e non una stringa, e devo specificare il campo colore='nero'. Correggo immediatamente i parametri."*
* ⚡ **`call`** *(Scelta 1: Riparazione Conforme)*:
  - `w_disegna_linea(x1=10.0, y1=0.0, x2=5.0, y2=8.66, colore="nero")` $\to$ *(id: `call_l2_fixed`)*

#### ⚙️ Validazione dell'Orchestratore $\Omega$:
- $payload \models \sigma_{in} \implies \text{True}$.
- La riparazione ha successo. L'automa esce da $q_{repair}$.
- **Yield & Ibernazione**: Invia $w_{disegna\_linea}$ a $W$. Il macro-ciclo avanza a **$c=2$**.

---

### CICLO $c=2$: Risveglio, Terza Linea e Chiusura del Triangolo

#### Risveglio dal Mondo
$W$ restituisce per `call_l2_fixed`: `{ linea_id: "L2", stato: "DISEGNATA" }`.
Arriva $P_2$. $G_\Omega$ manda in $q_{intro}$.

#### Step 7: Introspezione e Chiusura ($\tau = \langle 2, 6 \rangle$)
L'agente verifica il completamento di L2 ed emette:
- ⚡ **`call`**: `a_concludi_intro()`

---

#### Step 8: Fase Esecutiva — Tracciamento Linea 3 (Chiusura della Figura) ($\tau = \langle 2, 7 \rangle$)
$\Omega$ inietta $\delta_{start\_exec}$ ($t \leftarrow 7$).
* **Tools $\mathcal{V}_\Omega$**: $\{ w_{disegna\_linea}, a_{disegno\_completato} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Traccio l'ultima linea per chiudere il triangolo: dal vertice superiore (5, 8.66) fino all'origine (0, 0)."*
* ⚡ **`call`**:
  - `w_disegna_linea(x1=5.0, y1=8.66, x2=0.0, y2=0.0, colore="nero")` $\to$ *(id: `call_l3`)*

**Orchestratore $\Omega$**:
- **Yield & Ibernazione**: Terzo invio al Mondo $W$. Il macro-ciclo avanza a **$c=3$**.

---

### CICLO $c=3$: Compattazione del Flusso di Memoria e Halt Finale

#### Risveglio dal Mondo
$W$ restituisce: `{ linea_id: "L3", stato: "DISEGNATA" }`.
Arriva $P_3$. $G_\Omega$ instarda in $q_{intro}$ con $\delta_{start\_intro}$.

---

#### Step 9: Introspezione — Esecuzione di `compatta_memoria` ($\tau = \langle 3, 8 \rangle$)
L'agente nota che il flusso $E_p$ contiene molti messaggi intermedi di coordinate e correzioni errori. Decide di ripulire e compattare la storia prima di completare il mandato.

* **Tools $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Tutte e tre le linee del triangolo sono state disegnate con successo. Il flusso dei messaggi è lungo; compatto l'intervallo delle operazioni grafiche in un unico riassunto prima di uscire."*
* ⚡ **`call`** *(XOR Sottocaso 1: $X_k \subseteq A_{int}$)*:
  ```json
  compatta_memoria({
    "start_idx": 1,
    "end_idx": 15,
    "sintesi": "Disegnato con successo triangolo equilatero nero: Base L1 da (0,0) a (10,0), Lato L2 da (10,0) a (5,8.66) [corretto dopo errore di tipo], e Lato L3 da (5,8.66) a (0,0). Figura chiusa."
  })
  ```

#### ⚙️ Effetto di $\Omega$ sul Flusso di Coscienza $E_p$:
- $\Omega$ rimuove i messaggi dall'indice 1 all'indice 15.
- Inserisce al loro posto il singolo messaggio speciale con canale `summary`:
  $$e_{summary} = \langle \langle 3, 8 \rangle, \pi_\Omega, \text{summary}, \text{"Disegnato con successo triangolo..."}, \emptyset \rangle$$
- Il consumo di token per i passi successivi è abbattuto di oltre l'80%!
- Inietta $\delta_{loop\_intro}$ ($t \leftarrow 9$).

---

#### Step 10: Introspezione — Chiusura Post-Compattazione ($\tau = \langle 3, 9 \rangle$)
* **Messages $E_p$**: Ora contiene una cronologia ultra-compatta e pulita.
* **Tools $\mathcal{V}_\Omega$**: $A_{int} \cup \{ a_{concludi\_intro} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Memoria compattata e pulita. Chiudo l'introspezione."*
* ⚡ **`call`**: `a_concludi_intro()`

---

#### Step 11: Fase Esecutiva — Halt Definitivo ($\tau = \langle 3, 10 \rangle$)
$\Omega$ transita a $q_{exec}$ e inietta $\delta_{start\_exec}$ ($t \leftarrow 10$).
* **Tools $\mathcal{V}_\Omega$**: $\{ w_{disegna\_linea}, a_{disegno\_completato} \}$.

**Risposta del Modello $\mathbb{M}$**:
* 💭 **`thought`**: *"Tutti i requisiti sono soddisfatti: triangolo completato, chiuso e verificato. Emetto il contratto di terminazione tipizzato."*
* ⚡ **`call`** *(Sottocaso 2: Terminazione Tipizzata)*:
  ```json
  a_disegno_completato({
    "figura": "TRIANGOLO",
    "numero_linee": 3,
    "chiusa": true
  })
  ```

---

### 🛑 Transizione Finale: HALT

1. **Validazione di $\Omega$**:
   - $a_{disegno\_completato} \in A_{term} \implies \text{True}$.
   - $payload \models \sigma_{esito} \implies \text{True}$.
2. **Arresto Secco**:
   - Transizione a **$q_{halt}$**. Nessun ulteriore messaggio in $E_p$.
3. **Tagged Union emessa all'Utente**:
   ```json
   {
     "type": "a_disegno_completato",
     "payload": {
       "figura": "TRIANGOLO",
       "numero_linee": 3,
       "chiusa": true
     }
   }
   ```

