# Livello 1: Il Framework (Il Motore di Transizione Immutabile)

Questo livello definisce l'algoritmo primario, gestito dall'**Orchestratore ($\Omega$)**. 
È rigorosamente **agnostico rispetto al dominio aziendale** e implementa le leggi fisiche, temporali e logiche del sistema.

---

## Mappa Concettuale del Framework

```
formalization/02_framework/
├── introspective_universe.md   # 1.1 Insieme A_int_universal e funzioni endogene
├── router.md                   # 1.2 Funzione di Instradamento G_Ω
├── loop_intro.md               # 1.3 Fase 1: Loop Introspettivo Φ_intro
├── loop_exec.md                # 1.4 Fase 2: Loop Esecutivo Φ_exec
├── directives.md               # 1.5 Spazio delle Direttive Δ (δ_start_intro, δ_loop_intro, δ_start_exec)
├── fusion_operator.md          # 1.6 Semantica formale dell'operatore ⊕
├── message_ontology.md         # 1.7 Ontologia atomica dei messaggi e flusso di coscienza E_p
├── visibility_function.md      # 1.8 Funzione di visibilità delle azioni V_Ω e azione a_abort_call
├── frame_projection.md         # 1.9 Funzione di proiezione F_Ω e tripla di inferenza C_Ω
└── fsm_states.md               # 1.10 Automa a stati finiti globale M_FSM e diagramma di transizione
```

---

## 1.1 L'Universo Introspettivo di Base ($A_{int\_universal}$)
Il framework possiede internamente le funzioni endogene predefinite (i cosiddetti *tool cognitivi*), ognuna caratterizzata da un proprio schema di input $\sigma_{in}$.
Include l'azione speciale atomica $a_{concludi\_intro}(\emptyset)$ per attestare la convergenza.
👉 **Approfondimento completo**: [introspective_universe.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/introspective_universe.md)

---

## 1.2 La Funzione di Instradamento ($G_\Omega$)
Quando un nuovo Payload $P_t$ risveglia l'agente allo stato $S_{t-1}$, l'Orchestratore esamina $A_{int}$ per determinare la diramazione di esecuzione:
$$G_\Omega(S_{t-1}, P_t, A_{int}) = \begin{cases} 
\Phi_{intro}(S_{t-1} \oplus P_t, \ A_{int} \cup \{ a_{concludi\_intro} \}) & \text{Caso A: Agente Cognitivo } (A_{int} \neq \emptyset) \\  
\Phi_{exec}(S_{t-1} \oplus P_t, \ \emptyset) & \text{Caso B: Agente Reattivo } (A_{int} = \emptyset) 
\end{cases}$$
👉 **Approfondimento completo**: [router.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/router.md)

---

## 1.3 La Fase 1: Il Loop Introspettivo ($\Phi_{intro}$)
Evoluzione a micro-step discreti ($k = 0, 1, 2, \dots$) in cui la mente dell'agente si allinea senza accedere al mondo fisico esterno.
L'uscita dell'agente a ogni passo $X_k$ è rigidamente vincolata a due casi mutuamente esclusivi (XOR):
* **Continuazione**: $X_k \subseteq A_{int} \land X_k \neq \emptyset$
* **Convergenza**: $X_k = \{ a_{concludi\_intro} \}$ $\longrightarrow$ Consolidamento dello stato in $S_t$ e transizione a $\Phi_{exec}$.
👉 **Approfondimento completo**: [loop_intro.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_intro.md)

---

## 1.4 La Fase 2: Il Loop Esecutivo ($\Phi_{exec}$)
$\Omega$ revoca l'accesso a $A_{int}$, inietta la direttiva $\delta_{start\_exec}$ e abilita i soli tool del mondo $T_a$ e i contratti di uscita $A_{term}$.
L'agente emette $Y$, valutato da $\Omega$ come:
* **Yield**: $Y \subseteq T_a \longrightarrow$ Ibernazione del processo e invio asincrono a $W$.
* **Halt**: $Y = \{ a_{term\_i}(payload) \} \land payload \models \sigma_i \longrightarrow$ Spegnimento e restituzione deterministica del risultato.
👉 **Approfondimento completo**: [loop_exec.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/loop_exec.md)

---

## 1.5 Lo Spazio delle Direttive del Framework ($\Delta$)
Formalizzazione rigorosa dei vettori di controllo immessi da $\Omega$ per vincolare la traiettoria cognitiva ad ogni transizione:
$$\Delta = \{ \delta_{start\_intro}, \ \delta_{loop\_intro}, \ \delta_{start\_exec}, \ \delta_{err\_schema} \}$$
👉 **Approfondimento completo**: [directives.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/directives.md)

---

## 1.6 L'Operatore di Fusione di Stato ($\oplus$)
Operatore algebrico che regola come contesti informativi, direttive e risultati di azioni si integrano nello stato dell'agente preservandone l'invariante di coerenza.
👉 **Approfondimento completo**: [fusion_operator.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/fusion_operator.md)

---

## 1.7 L'Ontologia dei Messaggi e del Flusso di Coscienza ($E_p$)
Definizione atomica del singolo evento $e = \langle t_k, \pi, \kappa, \mu, \Sigma \rangle$, dello spazio dei ruoli $\Pi = \{ \pi_{\Omega}, \pi_{agent}, \pi_{world}, \pi_{user} \}$ e della tabella esaustiva dei punti di emissione e accodamento durante il ciclo vitale.
👉 **Approfondimento completo**: [message_ontology.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/message_ontology.md)

---

## 1.8 La Funzione di Visibilità delle Azioni ($\mathcal{V}_\Omega$)
Definizione formale della maschera di capacità che vincola le azioni accessibili per ogni direttiva $\delta$, e specifica dell'azione di rinuncia $a_{abort\_call}$ con consumo del turno (avanzamento a $k+1$ in $\Phi_{intro}$ o Yield a $t+1$ in $\Phi_{exec}$).
👉 **Approfondimento completo**: [visibility_function.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/visibility_function.md)

---

## 1.9 La Funzione di Proiezione del Frame di Stato ($\mathcal{F}_\Omega$)
Mappatura deterministica dello stato $S$ nel canale di sistema (`system instruction`), e definizione della tripla fondamentale di contesto per l'inferenza: $\mathcal{C}_\Omega(\delta, S) = \langle \mathcal{F}_\Omega(\delta, S), E_p, \mathcal{V}_\Omega(\delta, S) \rangle$.
👉 **Approfondimento completo**: [frame_projection.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/frame_projection.md)

---

## 1.10 L'Automa a Stati Finiti Globale ($\mathcal{M}_{FSM}$)
Formalizzazione rigorosa dell'automa $\mathcal{M}_{FSM} = \langle \mathcal{Q}, \Sigma_{in}, \Sigma_{out}, \Delta_{trans}, q_{sleep}, \{q_{halt}\} \rangle$, con il diagramma unificato degli stati e la matrice esaustiva di transizione da $q_{sleep}$ attraverso $q_{intro}, q_{exec}, q_{repair}, q_{yield}$ fino all'arresto definitivo in $q_{halt}$.
👉 **Approfondimento completo**: [fsm_states.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/02_framework/fsm_states.md)

