# 1.1 L'Universo Introspettivo di Base ($A_{int\_universal}$)

Questo documento formalizza l'insieme delle primitive cognitive incorporate nativamente nel Framework ed eseguite direttamente dall'Orchestratore $\Omega$.

---

## 1. Definizione dell'Insieme

L'universo introspettivo rappresenta l'insieme chiuso delle facoltà mentali che $\Omega$ è in grado di interpretare ed eseguire:

$$A_{int\_universal} = \mathcal{F}_{cognitive} \cup \{ a_{concludi\_intro}, a_{abort\_call} \}$$

Ogni funzione cognitiva $f \in \mathcal{F}_{cognitive}$ è caratterizzata da una firma rigida:

$$f: (payload \models \sigma_{in}) \longrightarrow (R \models \sigma_{out})$$

A differenza dei tool fisici di $W$, queste funzioni hanno accesso e facoltà di mutare i sotto-componenti dello stato interno ($M_s, D_s, T_a, E_p, L_a$).

---

## 2. Catalogo delle Primitive Cognitive Endogene

Le funzioni cognitive native sono suddivise per dominio operativo:

### 2.1 Gestione della Missione, Dati Strutturati e Compattazione di $E_p$
| Primitiva | Firma Schema | Effetto Computazionale |
| :--- | :--- | :--- |
| `aggiorna_missione`| $\sigma(\text{nuovo\_scopo}: \text{string})$ | Modifica esplicitamente la variabile $M_s$, alterando l'obiettivo a breve termine dell'agente. |
| `imposta_dato` | $\sigma(\text{chiave}: \text{string}, \text{valore}: \text{JSON})$ | **Mutabilità endogena di $D_s$**: inserisce o aggiorna una variabile di contesto nella lavagna dati: $D_s[\text{chiave}] \leftarrow \text{valore}$. |
| `elimina_dato` | $\sigma(\text{chiave}: \text{string})$ | **Rimozione da $D_s$**: elimina una variabile non più rilevante dal dizionario strutturato: $D_s \leftarrow D_s \setminus \{\text{chiave}\}$. |
| `compatta_memoria` | $\sigma(\text{start\_idx}: \text{int}, \text{end\_idx}: \text{int}, \text{sintesi}: \text{string})$ | **Compattazione ad intervallo (SOTA)**: Rimpiazza l'intera sotto-sequenza di messaggi $[e_{start}, \dots, e_{end}]$ in $E_p$ con un singolo messaggio speciale $e_{summary} = \langle \tau, \pi_\Omega, \text{summary}, \text{sintesi}, \emptyset \rangle$, comprimendo drasticamente i token senza perdere la memoria causale. |

### 2.2 Gestione Dinamica delle Capacità Operative ($T_a$)
In perfetta simmetria con la gestione della conoscenza, segue il modello Discovery $\to$ Mount $\to$ Dismount:

| Primitiva | Firma Schema | Effetto Computazionale |
| :--- | :--- | :--- |
| `cerca_tool` | $\sigma(\text{query}: \text{string}, \text{tag}?: \text{string})$ | **Ispezione passiva**: non muta $T_a$. Interroga il registro esogeno del Mondo $W$ ed emette un indice di anteprime delle API: $[\langle id_{tool}, \text{descrizione}, \text{categoria} \rangle]$. |
| `carica_tool` | $\sigma(\text{tool\_ids}: \text{Array}[\text{ID}] \subseteq W)$ | **Mount attivo**: estende il toolbelt operativo disponibile per la fase esecutiva: $T_a \leftarrow T_a \cup \{ tool\_ids \}$. |
| `scarica_tool` | $\sigma(\text{tool\_ids}: \text{Array}[\text{ID}] \subseteq T_a)$ | **Dismount**: restringe il perimetro esecutivo attivo: $T_a \leftarrow T_a \setminus \{ tool\_ids \}$. |

### 2.3 Gestione della Memoria Semantica e Conoscenza Attiva ($K_a$)
Il framework adotta un modello in tre tempi (Discovery $\to$ Commit $\to$ Evict) che evita l'inquinamento della finestra di contesto:

| Primitiva | Firma Schema | Effetto Computazionale |
| :--- | :--- | :--- |
| `cerca_concetti` | $\sigma(\text{query}: \text{string}, \text{top\_n}?: \text{int})$ | **Ispezione passiva**: non muta $K_a$. Interroga l'archivio semantico globale ed emette come risultato $R_k$ un indice sintetico di descrittori leggeri: $[\langle id_i, \text{titolo}_i, \text{anteprima}_i \rangle]$. |
| `carica_concetto` | $\sigma(\text{concetto\_ids}: \text{Array}[\text{ID}])$ | **Commit attivo**: estende il buffer dei concetti attivi a piena consapevolezza: $K_a \leftarrow K_a \cup \{ c_{id} \}$. |
| `scarica_concetto`| $\sigma(\text{concetto\_ids}: \text{Array}[\text{ID}])$ | **Eviction**: rilascia concetti non più utili dal contesto attivo: $K_a \leftarrow K_a \setminus \{ c_{id} \}$. |

---

## 3. L'Algebra delle Transizioni Cognitive ($\mathcal{T}_\Omega$)

Formalizziamo la funzione di transizione deterministica che mappa lo stato prima e dopo l'esecuzione di una primitiva cognitiva:

$$\mathcal{T}_\Omega: A_{int\_universal} \times \mathcal{S} \longrightarrow \mathcal{S} \times \mathcal{R}_{cognitivo}$$

Sia $S = \langle I, M_s, D_s, T_a, K_a, E_p \rangle$ lo stato di partenza. La tabella seguente fissa le equazioni algebriche di mutazione delle singole coordinate:

| Primitiva Invocata | Nuovo Stato $S'$ | Risultato Restituito $R$ | Invarianti Preservati |
| :--- | :--- | :--- | :--- |
| $\text{aggiorna\_missione}(m)$ | $\langle I, \ \mathbf{m}, \ D_s, \ T_a, \ K_a, \ E_p' \rangle$ | $\text{"OK"}$ | $I, D_s, T_a, K_a$ immutati |
| $\text{imposta\_dato}(k, v)$ | $\langle I, \ M_s, \ \mathbf{D_s \cup \{k \mapsto v\}}, \ T_a, \ K_a, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, T_a, K_a$ immutati |
| $\text{elimina\_dato}(k)$ | $\langle I, \ M_s, \ \mathbf{D_s \setminus \{k\}}, \ T_a, \ K_a, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, T_a, K_a$ immutati |
| $\text{cerca\_tool}(q)$ | $\langle I, \ M_s, \ D_s, \ T_a, \ K_a, \ E_p' \rangle$ | $[\langle id, desc \rangle \dots]$ | **Stato immutato** (ispezione pura) |
| $\text{carica\_tool}(ids)$ | $\langle I, \ M_s, \ D_s, \ \mathbf{T_a \cup ids}, \ K_a, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, D_s, K_a$ immutati |
| $\text{scarica\_tool}(ids)$ | $\langle I, \ M_s, \ D_s, \ \mathbf{T_a \setminus ids}, \ K_a, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, D_s, K_a$ immutati |
| $\text{cerca\_concetti}(q)$ | $\langle I, \ M_s, \ D_s, \ T_a, \ K_a, \ E_p' \rangle$ | $[\langle id, desc \rangle \dots]$ | **Stato immutato** (ispezione pura) |
| $\text{carica\_concetto}(ids)$ | $\langle I, \ M_s, \ D_s, \ T_a, \ \mathbf{K_a \cup \{c_{ids}\}}, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, D_s, T_a$ immutati |
| $\text{scarica\_concetto}(ids)$| $\langle I, \ M_s, \ D_s, \ T_a, \ \mathbf{K_a \setminus \{c_{ids}\}}, \ E_p' \rangle$ | $\text{"OK"}$ | $I, M_s, D_s, T_a$ immutati |
| $\text{compatta\_memoria}(i, j, s)$ | $\langle I, \ M_s, \ D_s, \ T_a, \ K_a, \ \mathbf{E_p^{(compattato)}} \rangle$ | $\text{"OK"}$ | $I, M_s, D_s, T_a, K_a$ immutati |

In ogni transizione, l'Identità Assoluta $I$ soddisfa la legge di invarianza: $\forall a \in A_{int\_universal}, \ \pi_I(\mathcal{T}_\Omega(a, S)) = I$.

---

## 4. Le Azioni Atomiche Speciali di Controllo

$\Omega$ governa direttamente due azioni speciali prive di parametri ($\sigma_{in} = \emptyset$) che alterano il flusso dell'automa:
1. **$a_{concludi\_intro}(\emptyset)$**: Segnala la convergenza epistemica e la transizione a $\Phi_{exec}$ (vedi [loop_intro.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md)).
2. **$a_{abort\_call}(\emptyset)$**: Segnala la rinuncia formale ad un'azione fallita in fase di correzione di schema, consumando il turno decisionale corrente (vedi [visibility_function.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/visibility_function.md)).

