import { z } from "zod";
import { defineAgent } from "@formal-agent/core";

// ============================================================================
// 1. CONTRATTI DI TERMINAZIONE (A_term)
// ============================================================================
export const confermaPaginaCarriereSchema = z.object({
  url: z.string().describe("L'URL della pagina web che elenca le posizioni aperte dell'azienda"),
  motivazione: z.string().describe("Breve spiegazione del perché questa è la pagina ufficiale con le offerte di lavoro"),
});
export type ConfermaPaginaCarriereResult = z.infer<typeof confermaPaginaCarriereSchema>;

export const segnalaPaginaInesistenteSchema = z.object({
  motivo: z.string().describe("Spiegazione del motivo per cui l'azienda non ha posizioni aperte (es. dichiarato sul sito)"),
});
export type SegnalaPaginaInesistenteResult = z.infer<typeof segnalaPaginaInesistenteSchema>;

export const segnalaRicercaNonConclusivaSchema = z.object({
  motivo: z.string().describe("Spiegazione del motivo per cui non è stato possibile trovare una pagina carriere ufficiale"),
});
export type SegnalaRicercaNonConclusivaResult = z.infer<typeof segnalaRicercaNonConclusivaSchema>;

// ============================================================================
// 2. SCHEMI DEI PARAMETRI E VALORI DI RITORNO DEI TOOL (W)
// ============================================================================
export const cercaWebParamsSchema = z.object({
  query: z.string().min(2).describe("Parole chiave di ricerca (es. 'Acme Corp sito ufficiale lavora con noi')"),
});

export const cercaWebReturnSchema = z.object({
  query_eseguita: z.string().describe("Query cercata"),
  risultati: z
    .array(
      z.object({
        title: z.string().describe("Titolo del risultato"),
        url: z.string().describe("Indirizzo web del risultato"),
        snippet: z.string().describe("Estratto sintetico"),
      })
    )
    .describe("Elenco dei migliori risultati trovati dal motore di ricerca"),
});

export const leggiPaginaWebParamsSchema = z.object({
  url: z.string().describe("URL della pagina web da visitare ed esaminare"),
});

export const leggiPaginaWebReturnSchema = z.object({
  successo: z.boolean().describe("Indica se la pagina è stata letta con successo"),
  url: z.string().describe("URL consultato"),
  titolo: z.string().nullable().describe("Titolo della pagina web"),
  contenuto_estratto: z.string().nullable().describe("Sintesi del testo principale della pagina"),
  link_rilevanti: z
    .array(
      z.object({
        testo: z.string().describe("Testo del link (es. 'Lavora con noi')"),
        url: z.string().describe("URL di destinazione"),
      })
    )
    .describe("Link rilevanti individuati nell'header, nel footer o nel testo della pagina"),
  errore: z.string().nullable().describe("Messaggio di errore in caso di fallimento della richiesta"),
});

// ============================================================================
// 3. CONTRATTO DICHIARATIVO DELL'AGENTE (Specifica Cognitiva Pura, zero I/O)
// ============================================================================
export const careerAgentContract = defineAgent({
  identity: `Sei l'Agente Investigatore Web per l'individuazione delle pagine carriere aziendali.
Il tuo compito è identificare e restituire l'URL della pagina web ufficiale in cui sono elencate le offerte di lavoro attive dell'azienda target.`,

  mission: "Individuare la pagina web ufficiale con le offerte di lavoro dell'azienda target.",

  knowledge: [
    {
      name: "definizione_pagina_carriere",
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

  tools: {
    w_cerca_web: {
      description: "Esegue una ricerca web restituendo i migliori risultati con titolo, URL e snippet.",
      parameters: cercaWebParamsSchema,
      returns: cercaWebReturnSchema,
    },
    w_leggi_pagina_web: {
      description: "Visita un URL ed estrae il titolo, il testo sintetico e tutti i link di navigazione pertinenti (inclusi header e footer).",
      parameters: leggiPaginaWebParamsSchema,
      returns: leggiPaginaWebReturnSchema,
    },
  },

  terminations: {
    conferma_pagina_carriere: {
      description: "Restituisce l'URL della pagina ufficiale che presenta l'elenco delle offerte di lavoro attive.",
      schema: confermaPaginaCarriereSchema,
    },
    segnala_pagina_inesistente: {
      description: "Segnala che sul sito ufficiale dell'azienda è attestata l'assenza di offerte di lavoro.",
      schema: segnalaPaginaInesistenteSchema,
    },
    segnala_ricerca_non_conclusiva: {
      description: "Segnala l'assenza di fonti web ufficiali dell'azienda con offerte di lavoro consultabili.",
      schema: segnalaRicercaNonConclusivaSchema,
    },
  },
});

