import { z } from "zod";
import type { AgentManifest } from "@formal-agent/core";

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
  I: `Sei l'Agente Investigatore Web per l'individuazione delle pagine carriere aziendali.
Il tuo compito è identificare e restituire l'URL della pagina web ufficiale in cui sono elencate le offerte di lavoro attive dell'azienda target.`,

  Ms0: "Individuare la pagina web ufficiale con le offerte di lavoro dell'azienda target.",

  Ka0: [
    {
      id: "definizione_pagina_carriere",
      descrizione: "Proprietà e criteri di conformità della pagina carriere ufficiale",
      corpo: `Una pagina web è la pagina carriere ufficiale dell'azienda quando soddisfa le seguenti caratteristiche oggettive:

1. TITOLARITÀ UFFICIALE:
   La pagina appartiene al dominio dell'azienda o al suo portale di assunzione diretto (es. subdomain dedicati o sistemi ATS ufficiali aziendali come Greenhouse, Lever, Workday integrati dall'azienda). Non costituiscono pagine aziendali le bacheche terze o gli aggregatori generici (es. LinkedIn, Indeed).

2. CONTENUTO RICHIESTO:
   La pagina presenta concretamente le posizioni lavorative aperte (elenco di ruoli, dipartimenti o schede di candidatura consultabili).
   Qualsiasi pagina ufficiale che esponga già un elenco consultabile di posizioni aperte è completa e conforme per la conferma.

3. CASI LIMITE:
   - Assenza esplicita di posizioni: se il sito ufficiale dichiara che non ci sono posizioni aperte o che l'azienda non assume, la situazione corrisponde a 'segnala_pagina_inesistente'.
   - Assenza di riscontri ufficiali: l'impossibilità di reperire la presenza web ufficiale dell'azienda corrisponde a 'segnala_ricerca_non_conclusiva'.`,
    },
  ],

  Ta0: ["w_cerca_web", "w_leggi_pagina_web"],

  A_term: [
    {
      id: "conferma_pagina_carriere",
      description: "Restituisce l'URL della pagina ufficiale che presenta l'elenco delle offerte di lavoro attive.",
      schema: confermaPaginaCarriereSchema,
    },
    {
      id: "segnala_pagina_inesistente",
      description: "Segnala che sul sito ufficiale dell'azienda è attestata l'assenza di offerte di lavoro.",
      schema: segnalaPaginaInesistenteSchema,
    },
    {
      id: "segnala_ricerca_non_conclusiva",
      description: "Segnala l'assenza di fonti web ufficiali dell'azienda con offerte di lavoro consultabili.",
      schema: segnalaRicercaNonConclusivaSchema,
    },
  ],
};
