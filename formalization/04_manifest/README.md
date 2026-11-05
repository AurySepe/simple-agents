# Livello 3: Il Manifesto dell'Agente

Il **Livello 3** definisce la configurazione dichiarativa di una specifica istanza di agente calata nel framework $\Omega$ e vincolata al Mondo $W$.

Non contiene logica imperativa o codice esecutivo, ma **soltanto parametri di configurazione e vincoli contrattuali** presi in carico ed applicati da $\Omega$.

$$\mathcal{M}_{agent} = \langle S_0, A_{int}, A_{term} \rangle$$

---

## Mappa Concettuale del Manifesto

```
formalization/04_manifest/
├── initial_state.md            # 3.1 Vettore di Inizializzazione dello Stato S_0
├── cognitive_permissions.md    # 3.2 Matrice dei Permessi Cognitivi A_int
└── termination_contracts.md    # 3.3 Contratti di Terminazione Tipizzati A_term
```

---

## 3.1 Il Vettore di Inizializzazione dello Stato ($S_0$)
Definisce le condizioni iniziali esatte al tempo logico $t = 0$:
$$S_0 = \langle I, M_{s0}, D_{s0}, T_{a0}, K_{a0}, E_{p0} \rangle$$
👉 **Approfondimento completo**: [initial_state.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/initial_state.md)

---

## 3.2 La Matrice dei Permessi Cognitivi ($A_{int}$)
Implementa il modello formale della **Capability-Based Security**:
$$A_{int} \subseteq A_{int\_universal} \setminus \{ a_{concludi\_intro} \}$$
Determina se l'agente è Cognitivo o Reattivo.
👉 **Approfondimento completo**: [cognitive_permissions.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/cognitive_permissions.md)

---

## 3.3 I Contratti di Terminazione Tipizzati ($A_{term}$)
La mappa rigorosa delle uscite tipizzate che decretano l'Halt del processo:
$$A_{term} = \{ a_{term\_1}(\sigma_1), \dots, a_{term\_p}(\sigma_p) \}$$
👉 **Approfondimento completo**: [termination_contracts.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/04_manifest/termination_contracts.md)

