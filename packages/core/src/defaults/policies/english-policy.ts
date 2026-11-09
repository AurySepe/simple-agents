import { DiagnosticErrorPayload } from '../../types/index.js';
import { OperationalPolicy } from './italian-policy.js';

export type { OperationalPolicy };

export const defaultEnglishPolicy: OperationalPolicy = {
  formatSchemaErrorMessage: (targetToolId, errorDetail) => {
    return `Invalid parameters for tool '${targetToolId}': ${errorDetail}`;
  },

  formatSyntaxErrorMessage: (targetToolId, rawText, errorDetail) => {
    return `Invalid JSON syntax in arguments for tool '${targetToolId}': ${errorDetail}. Received raw text: "${rawText}"`;
  },

  formatDiagnosticPayload: (code, message, details) => ({
    status: 'error',
    code,
    message,
    details
  })
};
