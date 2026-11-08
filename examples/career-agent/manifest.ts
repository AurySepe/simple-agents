import { z } from "zod";
import type { AgentManifest } from "../../src/index.js";

// ============================================================================
// 1. Contratto di Uscita Positiva: Pagina con le Posizioni Aperte Trovata
// ============================================================================
export const confermaPaginaCarriereSchema = z.object({
  url: z.string().describe("L'URL della pagina web che elenca le posizioni aperte dell'azienda"),
  motivazione: z.string().describe("Breve spiegazione del perché questa è la pagina ufficiale con le offerte di lavoro"),
});
export type ConfermaPaginaCarriereResult = z.infer<typeof confermaPaginaCarriereSchema>;

// ============================================================================
// 2. Contratto di Uscita Negativa: Pagina Carriere Accertata Inesistente
// ============================================================================
export const segnalaPaginaInesistenteSchema = z.object({
  motivo: z.string().describe("Spiegazione del motivo per cui l'azienda non ha posizioni aperte (es. dichiarato sul sito)"),
});
export type SegnalaPaginaInesistenteResult = z.infer<typeof segnalaPaginaInesistenteSchema>;

// ============================================================================
// 3. Contratto di Uscita Fallimentare: Ricerca Non Conclusiva
// ============================================================================
export const segnalaRicercaNonConclusivaSchema = z.object({
  motivo: z.string().describe("Spiegazione del motivo per cui non è stato possibile trovare una pagina carriere ufficiale"),
});
export type SegnalaRicercaNonConclusivaResult = z.infer<typeof segnalaRicercaNonConclusivaSchema>;

// ============================================================================
// IL MANIFESTO DELL'AGENTE (Ridotto all'osso, zero gergo tecnico)
// ============================================================================
export const careerAgentManifest: AgentManifest = {
  I: `Sei l'Agente Investigatore Web incaricato di trovare la pagina con le offerte di lavoro dell'azienda target.
Il tuo unico obiettivo è individuare l'URL della pagina ufficiale in cui sono concretamente elencate e consultabili le posizioni aperte dell'azienda.`,

  Ms0: "Trovare la pagina web ufficiale con l'elenco delle posizioni lavorative aperte dell'azienda target.",

  Ka0: [
    {
      id: "regole_ricerca_lavori",
      descrizione: "Regole essenziali per individuare la pagina con le offerte di lavoro",
      corpo: `1. OBIETTIVO CONCRETO: Cerchi la pagina che elenca effettivamente le posizioni lavorative aperte. Se una pagina visitata contiene solo testi generali sul lavoro e rimanda a un link per vedere le offerte di lavoro, non fermarti: visita quel link per raggiungere l'elenco concreto dei lavori.
2. FONTI UFFICIALI E DIVIETO INTERMEDIARI: La pagina deve essere quella a cui l'azienda rimanda direttamente. Non accettare bacheche generiche o aggregatori di terze parti (come LinkedIn o Indeed).
3. CASI ALTERNATIVI:
   - Se il sito dell'azienda dichiara esplicitamente che non assume o non ha posizioni aperte, usa 'segnala_pagina_inesistente'.
   - Se non trovi alcuna presenza o sito ufficiale dell'azienda, usa 'segnala_ricerca_non_conclusiva'.`,
    },
  ],

  Ta0: ["w_cerca_web", "w_leggi_pagina_web"],

  A_term: [
    {
      id: "conferma_pagina_carriere",
      description: "Conclude l'attività confermando l'URL della pagina ufficiale che elenca le posizioni lavorative aperte.",
      schema: confermaPaginaCarriereSchema,
    },
    {
      id: "segnala_pagina_inesistente",
      description: "Conclude l'attività segnalando che l'azienda non possiede una pagina carriere o non ha posizioni aperte.",
      schema: segnalaPaginaInesistenteSchema,
    },
    {
      id: "segnala_ricerca_non_conclusiva",
      description: "Conclude l'attività segnalando che non è stato possibile reperire una pagina ufficiale con le posizioni aperte.",
      schema: segnalaRicercaNonConclusivaSchema,
    },
  ],
};
