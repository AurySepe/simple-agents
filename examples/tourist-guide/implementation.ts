import {
  type CittaId,
  type MonumentId,
  touristGuideContract
} from './contract.js';

const MONUMENT_DATABASE: Record<
  MonumentId,
  { nome: string; citta: CittaId; orari: string; prezzo: string; note: string }
> = {
  colosseo: {
    nome: 'Colosseo (Anfiteatro Flavio)',
    citta: 'roma',
    orari: 'Tutti i giorni: 08:30 - 19:15 (ultimo ingresso alle 18:15)',
    prezzo: '€ 18.00 (Include accesso a Colosseo, Foro Romano e Colle Palatino)',
    note: 'Accesso nominativo con prenotazione obbligatoria online per evitare code.'
  },
  torre_di_pisa: {
    nome: 'Torre Pendente di Pisa (Campanile di Santa Maria Assunta)',
    citta: 'pisa',
    orari: 'Tutti i giorni: 09:00 - 20:00',
    prezzo: '€ 20.00 (Include salita alla Torre e visita alla Cattedrale)',
    note: 'Ingresso a slot scaglionati di 30 minuti; salita di 251 gradini senza ascensore.'
  },
  duomo_milano: {
    nome: 'Duomo di Milano (Cattedrale di Santa Maria Nascente)',
    citta: 'milano',
    orari: 'Cattedrale: 09:00 - 19:00 | Terrazze panoramiche: 09:00 - 20:00',
    prezzo: '€ 16.00 (Completo con terrazze a piedi) o € 22.00 (terrazze con ascensore)',
    note: 'Spalle e ginocchia coperte richieste per l\'accesso all\'interno della Cattedrale.'
  }
};

const METEO_DATABASE: Record<
  CittaId,
  { condizioni: string; temperatura: string; raccomandazione: string }
> = {
  roma: {
    condizioni: 'Sereno o poco nuvoloso',
    temperatura: '19°C',
    raccomandazione: 'Clima mite ideale per la visita all\'aperto del complesso archeologico.'
  },
  pisa: {
    condizioni: 'Soleggiato con brezza leggera',
    temperatura: '17°C',
    raccomandazione: 'Ottima illuminazione per fotografie della Torre e del Prato dei Miracoli.'
  },
  milano: {
    condizioni: 'Nuvoloso con leggera foschia autunnale',
    temperatura: '14°C',
    raccomandazione: 'Si consiglia una giacca a vento o impermeabile leggero per la visita alle Terrazze.'
  }
};

/**
 * ============================================================================
 * IMPLEMENTAZIONE DEI TOOL DELL'AGENTE GUIDA TURISTICA
 * ============================================================================
 */
export const touristGuideAgent = touristGuideContract.implement({
  tools: {
    consulta_orari_biglietti: async (payload) => {
      const data = MONUMENT_DATABASE[payload.monumento];
      return {
        monumento_id: payload.monumento,
        nome_monumento: data.nome,
        citta: data.citta,
        orari_apertura: data.orari,
        prezzo_biglietto: data.prezzo,
        note_visita: data.note
      };
    },

    consulta_meteo_citta: async (payload) => {
      const meteo = METEO_DATABASE[payload.citta];
      return {
        citta: payload.citta,
        condizioni_meteo: meteo.condizioni,
        temperatura_attuale: meteo.temperatura,
        consiglio_visitatore: meteo.raccomandazione
      };
    }
  }
});
