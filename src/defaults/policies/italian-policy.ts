import { DiagnosticErrorPayload } from '../../types/index.js';

export interface OperationalPolicy {
  formatSchemaErrorMessage: (targetToolId: string, errorDetail: string) => string;
  formatSyntaxErrorMessage: (targetToolId: string, rawText: string, errorDetail: string) => string;
  formatDiagnosticPayload: (
    code: DiagnosticErrorPayload['code'],
    message: string,
    details?: unknown
  ) => DiagnosticErrorPayload;
}

export const defaultItalianPolicy: OperationalPolicy = {
  formatSchemaErrorMessage: (targetToolId, errorDetail) => {
    return `Parametri non conformi allo schema per il tool '${targetToolId}': ${errorDetail}`;
  },

  formatSyntaxErrorMessage: (targetToolId, rawText, errorDetail) => {
    return `Sintassi JSON non valida negli argomenti per il tool '${targetToolId}': ${errorDetail}. Testo ricevuto: "${rawText}"`;
  },

  formatDiagnosticPayload: (code, message, details) => ({
    status: 'error',
    code,
    message,
    details
  })
};
