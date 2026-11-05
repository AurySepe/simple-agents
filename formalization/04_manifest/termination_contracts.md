# 3.3 I Contratti di Terminazione Tipizzati ($A_{term}$)

Questo documento descrive la formalizzazione delle uscite tipizzate dell'agente verso il sistema chiamante.

---

## 1. Definizione Formale

L'insieme dei contratti di terminazione definisce le modalità ammissibili con cui un agente può concludere il proprio ciclo vitale:

$$A_{term} = \{ a_{term\_1}(\sigma_1), a_{term\_2}(\sigma_2), \dots, a_{term\_p}(\sigma_p) \}$$

Ogni elemento in $A_{term}$ è una tupla:

$$a_{term\_i} = \langle \text{id}_i, \sigma_i \rangle$$

dove:
* $\text{id}_i$ è l'identificatore semantico dell'uscita (es. `consegna_risultato`, `notifica_impossibilita`, `richiesta_escalation_umana`).
* $\sigma_i$ è lo schema formale e obbligatorio che il payload di terminazione deve soddisfare.

---

## 2. Invariante di Terminazione e Modello a Tagged Union (Sum Type)

Nel Loop Esecutivo $\Phi_{exec}$, l'agente può emettere la richiesta di terminazione:

$$Y = \{ a_{term\_i}(payload) \}$$

$\Omega$ applica il predicato di validazione formale:

$$\text{Valido}(Y) \iff (a_{term\_i} \in A_{term}) \land (payload \models \sigma_i)$$

* **Se $\text{Valido}(Y) = \text{True}$**: il processo transita istantaneamente nello stato di **Halt**. L'output restituito al sistema o all'infrastruttura chiamante è modellato matematicamente come un **Tagged Union / Coprodotto (Sum Type)**:
  $$\text{ExitResult} = \langle a_{term\_i}, \ payload \rangle \in \coprod_{j=1}^p (\{a_{term\_j}\} \times \mathcal{L}(\sigma_j))$$
  Ciò consente all'ambiente chiamante di effettuare pattern matching esaustivo (es. distinguere tra esito di successo e notifica di impedimento) con garanzia matematica di conformità al contratto $\sigma_i$.
* **Se $\text{Valido}(Y) = \text{False}$**: la terminazione viene intercettata e respinta a livello runtime; l'agente riceve la direttiva $\delta_{err\_schema}$ per la correzione o l'eventuale rinuncia ($a_{abort\_call}$).

