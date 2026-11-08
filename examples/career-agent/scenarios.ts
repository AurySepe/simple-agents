export interface CareerScenario {
  id: number;
  titolo: string;
  azienda: string;
  descrizione: string;
  richiestaUtente: string;
  azioneTerminaleAttesa: string;
}

export const CAREER_SCENARIOS: CareerScenario[] = [
  {
    id: 1,
    titolo: "Pagina Carriere su Dominio Ufficiale (Acme Corp)",
    azienda: "Acme Corp",
    descrizione: "Società tecnologica con carriere ospitate sul proprio dominio www.acmecorp.com/careers e presenza di link terzo ingannevole (LinkedIn)",
    richiestaUtente: "Trova la pagina carriere ufficiale di Acme Corp dove sono elencati i lavori disponibili.",
    azioneTerminaleAttesa: "conferma_pagina_carriere",
  },
  {
    id: 2,
    titolo: "Carriere su ATS Esterno Verificato (FintechNova -> Greenhouse)",
    azienda: "FintechNova",
    descrizione: "Startup fintech i cui ruoli sono ospitati su Greenhouse, linkato ufficialmente dal footer del proprio sito",
    richiestaUtente: "Vorrei candidarmi per FintechNova, puoi trovarmi il link ufficiale alle loro posizioni aperte?",
    azioneTerminaleAttesa: "conferma_pagina_carriere",
  },
  {
    id: 3,
    titolo: "Azienda Reale ma Priva di Pagina Carriere (Bottega Digitale)",
    azienda: "Bottega Digitale",
    descrizione: "Studio web artigianale che dichiara esplicitamente sul proprio sito di avere organico al completo e nessuna sezione carriere",
    richiestaUtente: "Cerca la pagina lavora con noi di Bottega Digitale.",
    azioneTerminaleAttesa: "segnala_pagina_inesistente",
  },
  {
    id: 4,
    titolo: "Azienda Inesistente o Solo Directory Terze (GhostTech)",
    azienda: "GhostTech",
    descrizione: "Entità priva di sito istituzionale, presente solo in registri terzi o directory generiche",
    richiestaUtente: "Trova la pagina carriere ufficiale della società GhostTech.",
    azioneTerminaleAttesa: "segnala_ricerca_non_conclusiva",
  },
];

