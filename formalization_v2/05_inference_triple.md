# 05. La Tripla di Inferenza ($\mathcal{C}_\Omega$) e la Funzione di Proiezione

Questo documento formalizza la costruzione del contesto inviato al modello linguistico e la funzione di proiezione che trasforma lo stato dell'agente nel messaggio di sistema.

---

## 1. La Tripla di Inferenza ($\mathcal{C}_\Omega$)

Ad ogni turno computazionale in cui l'automa richiede una decisione (negli stati $q_{exec}$ o $q_{repair}$), l'Orchestratore $\Omega_{op}$ costruisce una struttura unificata denominata **Tripla di Inferenza**:

$$\mathcal{C}_\Omega = \langle \mathcal{F}_\Omega(S), \ E_p, \ \mathcal{V}_\Omega(q) \rangle$$

La tripla è composta da tre elementi ortogonali e non sovrapposti:
1. **$\mathcal{F}_\Omega(S)$**: Il *System Frame*, proiezione canonica dello stato stabile nel canale di sistema.
2. **$E_p$**: La traccia cronologica ordinata di tutti i messaggi ed eventi scambiati.
3. **$\mathcal{V}_\Omega(q)$**: L'insieme degli schemi di funzione (tool definitions) attualmente visibili e invocabili.

---

## 2. La Funzione di Proiezione del Frame di Stato ($\mathcal{F}_\Omega$)

La funzione di proiezione $\mathcal{F}_\Omega$ è una mappatura deterministica pura che riceve in ingresso le componenti semantiche dello stato $S$ e produce in uscita il messaggio di sistema per il canale `system`:

$$\mathcal{F}_\Omega: \langle I, \ M_s, \ D_s, \ K_a \rangle \to \text{Message}_{system}$$

### Flessibilità Strutturale e Agnosticismo di Formato:
L'architettura **non impone un template o una sintassi rigida** per il messaggio di sistema. La funzione di proiezione è libera di impiegare qualunque rappresentazione testuale (Markdown, XML, JSON, YAML o testo non strutturato), ordinamento di sezioni o strategia di rendering più adatta alla specifica famiglia di modelli linguistici adottata, a condizione che trasferisca le informazioni derivate dalle coordinate di stato $\langle I, M_s, D_s, K_a \rangle$.

### Esempio Illustrativo di Rendering (Non Normativo):
Il seguente blocco rappresenta una delle possibili concretizzazioni di $\mathcal{F}_\Omega(S)$:

```markdown
# SYSTEM FRAME

## 1. IDENTITY & PERSONA
- Name: [I.name]
- Role: [I.role]
- Communication Tone: [I.tone]

## 2. OPERATIONAL MISSION
[Ms]

## 3. STRUCTURED OPERATIONAL DATA
[Ds - Mappa dei parametri, variabili di contesto e configurazioni operative in formato JSON]

## 4. ACTIVE KNOWLEDGE BUFFER
[Ka - Definizioni semantiche e documentazione di dominio pre-caricata]
```

### Proprietà Fondamentali della Proiezione:
* **Agnosticismo di Forma**: L'implementatore dell'adattatore ha piena libertà di scegliere tag XML (es. `<identity>`, `<mission>`, `<data>`, `<knowledge>`), sezioni Markdown o blocchi JSON, purché la funzione sia una trasformazione pura degli input di stato.
* **Invarianza rispetto alle Direttive**: Il frame definisce la contestualizzazione statica ("chi è l'agente", "qual è il suo scopo", "quali dati e conoscenze ha"), evitando l'iniezione dinamica di comandi procedurali o direttive condizionali forzate turno per turno.
* **Stabilità e Caching**: A parità di input $\langle I, M_s, D_s, K_a \rangle$, la funzione produce deterministicamente il medesimo output testuale, ottimizzando l'efficienza della cache dei prefissi di contesto (KV Cache Optimization).

---

## 3. Il Modello Linguistico come Trasduttore ($\mathbb{M}$)

Il modello linguistico è modellato matematicamente come un trasduttore stocastico vincolato:

$$\mathbb{M}(\mathcal{C}_\Omega) \to \langle \text{thought}^?, \ \mathcal{A}_{calls} \rangle$$

Dove:
* **$\text{thought}^?$**: Buffer deliberativo di ragionamento interno (catena di pensiero, Chain of Thought), emesso in appositi blocchi delimitati.
* **$\mathcal{A}_{calls}$**: Vettore finito di chiamate a funzione:
  $$\mathcal{A}_{calls} = [ a_1(payload_1), \ a_2(payload_2), \ \dots, \ a_k(payload_k) ]$$
  con $k \ge 1$ e ogni $a_i \in \mathcal{V}_\Omega(q)$.

---

## 4. Semantica del Pensiero Deliberativo

1. **Scopo Esclusivo**: Il blocco $\text{thought}$ funge da spazio computazionale temporaneo di pianificazione per analizzare le evidenze, formulare ipotesi e strutturare gli argomenti delle chiamate a tool.
2. **Volatilità / Ephemeral Thinking**: Per preservare l'efficienza della finestra di contesto ed evitare distorsioni da ragionamenti obsoleti, il contenuto deliberativo $\text{thought}$ può essere configurato come *effimero*:
   - Utilizzato per produrre $\mathcal{A}_{calls}$ nel turno $t$;
   - Escluso o compresso nella persistenza a lungo termine di $E_p$, registrando unicamente la chiamata effettiva $\mathcal{A}_{calls}$ e il relativo esito.

