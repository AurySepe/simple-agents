# 3.1 Il Vettore di Inizializzazione dello Stato ($S_0$)

Questo documento dettaglia la struttura e i vincoli algebrici del vettore di stato iniziale dell'agente al tempo discreto $t = 0$.

---

## 1. Struttura del Vettore

$$S_0 = \langle I, M_{s0}, D_{s0}, T_{a0}, K_{a0}, E_{p0} \rangle$$

---

## 2. Definizione dei Singoli Componenti

### 2.1 Identità Assoluta ($I$)
* **Tipo**: Costante testuale immutabile.
* **Invariante**: $\forall t \ge 0, \quad \pi_I(S_t) = I$.
* **Scopo**: Fissa le regole invalicabili, il dominio etico e i principi base di comportamento che nessuna operazione introspettiva o di mondo può sovrascrivere.

### 2.2 Stato di Missione Iniziale ($M_{s0}$)
* **Tipo**: Variabile testuale/simbolica mutabile.
* **Scopo**: Definisce l'obiettivo o mandato a breve termine dell'agente. Può essere aggiornato dinamicamente tramite la primitiva `aggiorna_missione` durante $\Phi_{intro}$.

### 2.3 Dati Strutturati Iniziali ($D_{s0}$)
* **Tipo**: Mappa associativa / Record tipizzato (JSON).
* **Doppia Mutabilità**:
  * **Endogena**: L'agente può aggiungere/aggiornare variabili in $D_s$ tramite `imposta_dato` o rimuoverle con `elimina_dato`.
  * **Esogena**: I risultati dei tool del mondo $W$ o il payload dell'utente possono contenere patch $\Delta D_s$ che $\Omega$ fonde deterministicamente nello stato.
* **Scopo**: Rappresenta la memoria di lavoro condivisa a breve/medio termine tra agente, mondo e orchestratore.

### 2.4 Toolbelt Iniziale ($T_{a0}$)
* **Tipo**: Insieme di riferimenti a funzioni ($T_{a0} \subseteq W$).
* **Scopo**: Stabilisce quali strumenti del mondo esterno sono immediatamente invocabili all'accensione dell'agente. Può essere esteso o ristretto via `carica_tool` / `scarica_tool`.

### 2.5 Buffer dei Concetti Attivi Iniziale ($K_{a0}$)
* **Tipo**: Insieme finito di schede concettuali tipizzate ($K_{a0} \subseteq \mathcal{U}_{knowledge}$).
* **Ontologia di un Concetto ($c \in \mathcal{U}_{knowledge}$)**:
  Ciascun concetto è formalizzato come la tripla essenziale:
  $$c = \langle id, \ \text{descrizione}, \ \text{corpo} \rangle$$
  * $id$: Identificativo univoco del concetto.
  * $\text{descrizione}$: Sintesi semantica restituita da `cerca_concetti` per valutazione leggera.
  * $\text{corpo}$: Testo integrale della regola/policy caricato in $K_a$ tramite `carica_concetto` e proiettato nel Frame $\mathcal{F}_\Omega$.
* **Scopo**: Definisce la conoscenza semantica a testo pieno presente nella consapevolezza dell'agente.

### 2.6 Flusso di Coscienza Iniziale ($E_{p0}$)
* **Tipo**: Sequenza finita e ordinata di messaggi tipizzati: $E_{p0} = [e_0, \dots, e_m] \in \mathcal{E}^*$.
* **Struttura di ogni evento**: Ciascun messaggio è una 5-upla $e = \langle \tau, \pi, \kappa, \mu, id \rangle$ marcata con tempo $\tau = \langle c, t \rangle$ ed emessa con uno specifico ruolo $\pi \in \Pi$.
* **Scopo**: Se l'agente è istanziato da zero, $E_{p0} = \emptyset$. In scenari di ripristino o ibernazione persistente (*State Hydration*), contiene la cronistoria dei cicli e dei tick decisionali precedenti.

