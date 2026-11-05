# 3.2 La Matrice dei Permessi Cognitivi ($A_{int}$)

Questo documento formalizza il meccanismo di **Capability-Based Security** applicato ai processi mentali dell'agente.

---

## 1. Definizione dell'Insieme

La matrice dei permessi cognitivi $A_{int}$ è un sottoinsieme rigoroso dell'universo introspettivo:

$$A_{int} \subseteq A_{int\_universal} \setminus \{ a_{concludi\_intro}, a_{abort\_call} \}$$

---

## 2. Principi di Sicurezza Formale

1. **Principio del Minimo Privilegio**: All'agente non viene concesso automaticamente l'intero universo $A_{int\_universal}$. Ad esempio, un agente operativo può ricevere `cerca_tool` e `carica_tool`, ma non avere permessi per `aggiorna_missione`.
2. **Iniezione Dinamica delle Azioni di Controllo**: Lo sviluppatore o l'utente non include mai $a_{concludi\_intro}$ o $a_{abort\_call}$ in $A_{int}$. Tali azioni vengono aggiunte dinamicamente ed esclusivamente dall'Orchestratore $\Omega$ in base alla funzione di visibilità $\mathcal{V}_\Omega$:
   * $a_{concludi\_intro}$ all'interno di $\Phi_{intro}$.
   * $a_{abort\_call}$ in caso di errore di schema ($\delta_{err\_schema}$).
3. **Comportamento Zero-Shot**: Se il Manifesto dichiara $A_{int} = \emptyset$, $\Omega$ bypassa completamente $\Phi_{intro}$ instradando l'agente al Caso B di $G_\Omega$.

