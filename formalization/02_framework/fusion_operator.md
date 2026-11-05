# 1.6 L'Operatore di Fusione di Stato ($\oplus$)

Questo documento definisce l'operatore algebrico $\oplus$ (State Fusion Operator) che governa l'incorporamento sequenziale di evidenze, risposte e direttive nello stato dell'agente.

---

## 1. Definizione Algebrica

Sia $\mathcal{S}$ lo spazio dei possibili stati dell'agente e $\mathcal{E}$ lo spazio degli elementi di transizione (Payload dal mondo $P_t$, risultati introspettivi $R_k$, direttive $\delta \in \Delta$).

L'operatore di fusione è una funzione parziale:

$$\oplus: \mathcal{S} \times \mathcal{E} \longrightarrow \mathcal{S}$$

Tale operatore **non è commutativo**:
$$S \oplus E \neq E \oplus S$$
poiché l'ordine temporale degli eventi preserva la causalità e la precedenza degli aggiornamenti informativi.

---

## 2. Proprietà di Coerenza

1. **Invariante di Identità**:
   Per ogni stato $S = \langle I, M_s, D_s, T_a, E_p, L_a \rangle$ e per ogni elemento di transizione $E$, l'identità $I$ rimane inalterata:
   $$\pi_I(S \oplus E) = \pi_I(S) = I$$
2. **Aggiornamento di Cronologia (Concatenazione sul Flusso $E_p$)**:
   Quando l'elemento è il Payload del mondo $P_t = E_{world} \cdot E_{user} \cdot [e_\delta]$, la fusione sulla componente $E_p$ si riduce algebricamente all'operatore di **concatenazione finita ordinata** ($\cdot$):
   $$\pi_{E_p}(S_{t-1} \oplus P_t) = \pi_{E_p}(S_{t-1}) \cdot E_{world} \cdot E_{user} \cdot [e_\delta]$$
   Allo stesso modo, durante i micro-step di $\Phi_{intro}$ o $\Phi_{exec}$, l'accodamento dei messaggi di pensiero, chiamata, risultato e direttiva segue:
   $$E_p^{(nuovo)} = E_p \cdot [e_{thought}] \cdot [e_{call}] \cdot [e_{res}] \cdot [e_\delta]$$
3. **Integrazione Dati Contestuali**:
   I campi strutturati derivanti da risultati passivi o mutazioni di memoria vengono combinati determinando la risoluzione di eventuali sovrascritture di chiavi informative.

