# 1.2 La Funzione di Instradamento ($G_\Omega$)

La funzione di instradamento $G_\Omega$ governa il punto d'ingresso dell'agente nel grafo di esecuzione al momento del risveglio causato da un Payload esogeno $P_t$.

---

## 1. Definizione Formale

La funzione $G_\Omega$ opera su una tripla:

$$G_\Omega: \mathcal{S} \times \mathcal{P} \times \mathcal{P}(A_{int\_universal}) \longrightarrow \text{Flusso}(\Phi_{intro} \cup \Phi_{exec})$$

Ed è definita in modo esaustivo come:

$$G_\Omega(S_{t-1}, P_t, A_{int}) = \begin{cases} 
\Phi_{intro}(S_{t-1} \oplus P_t, \ A_{int} \cup \{ a_{concludi\_intro} \}) & \text{Caso A: Agente Cognitivo } (A_{int} \neq \emptyset) \\  
\Phi_{exec}(S_{t-1} \oplus P_t, \ \emptyset) & \text{Caso B: Agente Reattivo } (A_{int} = \emptyset) 
\end{cases}$$

Dove il Payload $P_t$ contiene deterministamente in coda la direttiva $e_\delta$ calcolata da $G_\Omega$:
* Se $A_{int} \neq \emptyset \implies e_\delta = \langle (t, 0), \pi_\Omega, \text{directive}, \delta_{start\_intro}, \emptyset \rangle$
* Se $A_{int} = \emptyset \implies e_\delta = \langle (t, 0), \pi_\Omega, \text{directive}, \delta_{start\_exec}, \emptyset \rangle$

---

## 2. Analisi dei Casi

### Caso A: Agente Cognitivo ($A_{int} \neq \emptyset$)
* L'agente dispone di permessi di manipolazione interiore della memoria concessi nel suo Manifesto.
* $\Omega$ non permette l'esecuzione diretta sul mondo fisico.
* Prima di qualsiasi azione esterna, l'agente viene instradato nel [Loop Introspettivo $\Phi_{intro}$](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md).

### Caso B: Agente Reattivo / Zero-Shot ($A_{int} = \emptyset$)
* L'agente non possiede facoltà introspettive configurate.
* $\Omega$ salta completamente la Fase 1, evitando computazioni futili.
* L'agente viene instradato direttamente al [Loop Esecutivo $\Phi_{exec}$](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_exec.md).

