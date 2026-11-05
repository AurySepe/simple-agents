# Livello 2: Il Mondo (Dominio Aziendale / Esterno)

Il **Livello 2** formalizza l'ambiente esogeno con cui l'agente interagisce. Viene iniettato nell'Orchestratore $\Omega$ prima della fase di avvio del ciclo vitale.

---

## Mappa Concettuale del Mondo

```
formalization/03_world/
├── tool_signatures.md          # 2.1 Firme formali dei tool (σ_in, σ_out) e registro W
└── state_isolation.md          # 2.2 Principio e teorema di isolamento dello stato
```

---

## 2.1 Il Registro degli Strumenti ($W$)
Il Mondo è modellato come un catalogo formalmente verificato di funzioni fisiche o transazionali:
$$W = \{ w_1, w_2, \dots, w_m \}$$
Ciascuna funzione $w \in W$ è descritta da una firma tipizzata:
$$w: (payload \models \sigma_{in}) \longrightarrow (Result \models \sigma_{out})$$
👉 **Approfondimento completo**: [tool_signatures.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/tool_signatures.md)

---

## 2.2 Principio di Isolamento dello Stato
Teorema fondamentale del disaccoppiamento:
$$\forall w \in W, \quad w \text{ non può alterare direttamente } S_t$$
I tool restituiscono solo risultati passivi a $\Omega$, che li re-impacchetta nel Payload $P_{t+1}$.
👉 **Approfondimento completo**: [state_isolation.md](file:///c:/Users/aurel/Desktop/Progetti/Ricerca/Agent/formalization/03_world/state_isolation.md)

