# 04. Spazio delle Azioni ($\Sigma$) e Funzione di Visibilità ($\mathcal{V}_\Omega$)

Questo documento formalizza l'alfabeto delle azioni ammissibili per l'agente operativo, la classificazione dei tool e la funzione di visibilità dinamica che regola l'accesso alle capacità.

---

## 1. Alfabeto Totale delle Azioni ($\Sigma$)

L'universo delle azioni invocabili dall'agente operativo è la partizione disgiunta:

$$\Sigma = T_a \ \cup \ A_{term} \ \cup \ \{ a_{abort\_call} \}$$

Nessuna azione esterna a questo insieme può essere deliberata o eseguita dall'agente.

---

## 2. Tassonomia delle Azioni

### 2.1 Tool Fisici del Mondo ($T_a$)
I tool fisici rappresentano le capacità operative dell'agente nel mondo esterno $W$ (lettura di database, chiamate ad API HTTP, scritture su file system, esecuzione di script).

Ogni tool $t \in T_a$ è formalmente definito da una tupla contrattuale:

$$t = \langle \text{id}, \ \text{name}, \ \sigma_{in}, \ \sigma_{out}, \ \text{description} \rangle$$

* **$\text{id}$**: Identificativo univoco del tool nel catalogo.
* **$\text{name}$**: Nome simbolico invocabile dall'agente.
* **$\sigma_{in}$**: Schema di validazione forte dei parametri di ingresso (es. schema Zod/JSON-Schema).
* **$\sigma_{out}$**: Schema di validazione forte del risultato restituito dal mondo.
* **$\text{description}$**: Descrizione in linguaggio naturale del comportamento e scopo del tool per il modello linguistico.

### 2.2 Contratti di Terminazione Tipizzati ($A_{term}$)
I contratti di terminazione rappresentano le porte di uscita esclusive con cui l'agente dichiara completato il proprio compito ed emette la risposta verso l'utente o il sistema chiamante.

Ogni azione terminale $a_{term} \in A_{term}$ possiede uno schema di payload rigoroso:

$$a_{term} = \langle \text{name}, \ \sigma_{exit}, \ \text{description} \rangle$$

Esempi canonici di contratti di terminazione:
1. `respond_to_user({ message: string, confidence: number })`
2. `escalate_to_human({ reason: string, context_summary: string })`
3. `complete_task({ status: "success" | "partial", result_data: object })`

#### Regola di Mutua Esclusione Terminale:
Un'azione di terminazione **non può mai** essere eseguita in parallelo ad altre azioni o ad altri contratti terminali nello stesso turno:

$$a \in A_{term} \land a \in \mathcal{A}_{calls} \implies |\mathcal{A}_{calls}| = 1$$

Qualora il modello emetta contemporaneamente un'azione terminale e un tool ordinario ($a_{term} \in \mathcal{A} \land \exists t \in T_a : t \in \mathcal{A}$), l'Orchestratore $\Omega_{op}$ rifiuta l'emissione e solleva un'incoerenza strutturale.

### 2.3 Azione Atomica di Abort ($a_{abort\_call}$)
Azione speciale di recupero priva di argomenti complessi, attivata esclusivamente durante lo stato di riparazione schema ($q_{repair}$):

$$a_{abort\_call} = \langle \text{"abort\_call"}, \ \emptyset, \ \text{"Annulla la chiamata non valida e riprende la deliberazione"} \rangle$$

Permette all'agente di rinunciare a una chiamata a tool malformata senza bloccare l'intero ciclo esecutivo.

---

## 3. La Funzione di Visibilità Dinamica ($\mathcal{V}_\Omega$)

La funzione di visibilità $\mathcal{V}_\Omega: \mathcal{Q} \to \mathcal{P}(\Sigma)$ mappa deterministamente lo stato corrente dell'automa $q \in \mathcal{Q}$ nell'insieme esatto di strumenti e definizioni serializzate all'interno del contesto dell'LLM:

$$\mathcal{V}_\Omega(q) = \begin{cases}
T_a \cup A_{term} & \text{se } q = q_{exec} \\
\{ a_{target}, \ a_{abort\_call} \} & \text{se } q = q_{repair} \\
\emptyset & \text{se } q \in \{ q_{sleep}, \ q_{yield}, \ q_{halt} \}
\end{cases}$$

### Proprietà di Sicurezza Garantite da $\mathcal{V}_\Omega$:
1. **Zero Allucinazione di Tool Fuori Contesto**: Nello stato ordinario $q_{exec}$, l'agente vede esattamente i tool operativi $T_a$ e i contratti terminali $A_{term}$.
2. **Focus Circolarizzato in Riparazione**: In $q_{repair}$, l'agente non può tentare azioni casuali; vede esclusivamente lo strumento specifico che necessita di correzione ($a_{target}$) o la via di fuga controllata ($a_{abort\_call}$).
3. **Impossibilità di Chiamate in Stati Passivi**: Quando l'agente attende esiti asincroni ($q_{yield}$) o è a riposo ($q_{sleep}$), il set di tool visibili è $\emptyset$, impedendo race conditions o invocazioni spurie.

---

## 4. Validazione Contrattuale e Soddisfacimento di Tipo ($\models$)

Prima di autorizzare qualsiasi transizione o dispatch verso il mondo fisico, l'Orchestratore $\Omega_{op}$ valida formalmente i parametri:

$$\text{Validate}(\mathcal{A}_{calls}) = \begin{cases}
\text{SUCCESS} & \iff \forall a \in \mathcal{A}_{calls}, \ a.name \in \mathcal{V}_\Omega(q) \ \land \ a.payload \models \sigma_{in}(a) \\
\text{TYPE\_ERROR} & \iff \exists a \in \mathcal{A}_{calls} : a.payload \not\models \sigma_{in}(a) \\
\text{FORBIDDEN} & \iff \exists a \in \mathcal{A}_{calls} : a.name \notin \mathcal{V}_\Omega(q)
\end{cases}$$

