# Esempio Reattivo: Rilevatore di Lingua (Zero-Shot Puro)

Questo documento illustra un'esecuzione reattiva deterministica, dimostrando il **Caso B del router $G_\Omega$** in cui l'agente non possiede permessi introspettivi ($A_{int} = \emptyset$). 
Il sistema non spreca computazione cognitiva: salta interamente $\Phi_{intro}$ e risolve il task in **un singolo tick decisionale ($t=0$) e zero cicli di Yield col mondo ($c=0$)**.

---

## 1. Condizioni Iniziali del Sistema

* **Registro Funzioni Fisiche ($W$)**: $\emptyset$ *(nessun tool esterno necessario)*.
* **Archivio Globale Concetti ($\mathcal{U}_{knowledge}$)**: $\emptyset$.
* **Manifesto dell'Agente ($\mathcal{M}_{agent}$)**:
  * $I = \text{"Sei un classificatore linguistico rigoroso. Identifica la lingua del testo fornito."}$
  * $M_{s0} = \text{"Identificare lingua del payload in ingresso"}$
  * $D_{s0} = \emptyset$
  * $T_{a0} = \emptyset$
  * $K_{a0} = \emptyset$
  * $E_{p0} = []$
* **Permessi Cognitivi**:
  $$A_{int} = \emptyset \quad (\text{Agente Puramente Reattivo})$$
* **Contratti di Terminazione ($A_{term}$)**:
  * $a_{lingua\_rilevata}(\sigma_{classificazione})$ dove:
    $$\sigma_{classificazione} = \{ \text{codice\_iso}: \text{string}, \text{nome\_lingua}: \text{string}, \text{confidenza}: \text{float} \}$$

---

## 2. Trascrizione Chat & Tripla di Inferenza ($c=0, t=0$)

### Evento Iniziale
L'utente invia il payload $P_0$:
> *"Bonjour tout le monde, comment allez-vous aujourd'hui?"*

L'automa passa da $q_{sleep} \to q_{router}$.
L'Orchestratore $\Omega$ valuta la condizione di instradamento:
$$G_\Omega(S_0, P_0, A_{int} = \emptyset) \implies \Phi_{exec}(S_0 \oplus P_0, \ \emptyset)$$
Il Loop Introspettivo $\Phi_{intro}$ viene completamente scavalcato. L'automa transita direttamente in **$q_{exec}$**, iniettando la direttiva $\delta_{start\_exec}$.

---

### Step Unico: Risoluzione Reattiva e Halt Immediato ($\tau = \langle 0, 0 \rangle$)

#### 📥 Tripla di Inferenza $\mathcal{C}_\Omega(\delta_{start\_exec}, S_0)$ inviata all'LLM:
* **Canale 1: System Frame $\mathcal{F}_\Omega$**
  ```markdown
  # IDENTITÀ (I)
  Sei un classificatore linguistico rigoroso. Identifica la lingua del testo fornito.

  # MISSIONE CORRENTE (M_s)
  Identificare lingua del payload in ingresso

  # DATI STRUTTURATI (D_s)
  {}

  # CONCETTI ATTIVI (K_a)
  (Nessun concetto)
  ```
* **Canale 2: Flusso di Coscienza $E_p$ (Messages)**
  ```json
  [
    {
      "tau": [0, 0],
      "role": "user",
      "channel": "payload",
      "content": "Bonjour tout le monde, comment allez-vous aujourd'hui?"
    },
    {
      "tau": [0, 0],
      "role": "orchestrator",
      "channel": "directive",
      "content": "δ_start_exec: Agente reattivo. Emetti direttamente il contratto di terminazione tipizzato (A_term)."
    }
  ]
  ```
* **Canale 3: Schemi Tool Visibili $\mathcal{V}_\Omega$ (Tools)**
  ```
  T_a ∪ A_term = [
    a_lingua_rilevata
  ]
  ```

#### 📤 Risposta del Modello $\mathbb{M}$:
* 💭 **`thought`**: *"Il testo 'Bonjour tout le monde, comment allez-vous aujourd'hui?' è inequivocabilmente in lingua francese. Emetto direttamente il contratto di terminazione a_lingua_rilevata con codice ISO 'fr'."*
* ⚡ **`call`** *(Sottocaso 2 di $\Phi_{exec}$: Terminazione Tipizzata)*:
  ```json
  a_lingua_rilevata({
    "codice_iso": "fr",
    "nome_lingua": "Francese",
    "confidenza": 0.99
  })
  ```

---

### 🛑 Transizione Finale: HALT

1. **Validazione di $\Omega$**:
   - $a_{lingua\_rilevata} \in A_{term} \implies \text{True}$.
   - $payload \models \sigma_{classificazione} \implies \text{True}$.
2. **Arresto Secco**:
   - L'automa transita in **$q_{halt}$** all'istante.
   - Nessun ulteriore messaggio viene aggiunto a $E_p$.
   - Risorse rilasciate al tick zero.
3. **Tagged Union emessa verso l'infrastruttura chiamante**:
   ```json
   {
     "type": "a_lingua_rilevata",
     "payload": {
       "codice_iso": "fr",
       "nome_lingua": "Francese",
       "confidenza": 0.99
     }
   }
   ```

---

## 3. Perché Questo Esempio è Fondamentale
Dimostra la **modularità adattiva del framework**: quando un problema è semplice o non richiede riflessione, il modello non viene forzato in micro-loop inutili. La funzione $G_\Omega$ adatta la complessità computazionale alla configurazione dell'agente.

