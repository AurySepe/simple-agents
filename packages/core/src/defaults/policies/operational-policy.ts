import { DiagnosticErrorCode, DiagnosticErrorPayload } from '../../types/index.js';

export interface OperationalPolicy {
  formatSchemaErrorMessage: (targetToolId: string, errorDetail: string) => string;
  formatSyntaxErrorMessage: (targetToolId: string, rawText: string, errorDetail: string) => string;
  formatDiagnosticPayload: (
    code: DiagnosticErrorCode,
    message: string,
    details?: Record<string, unknown> | { rawText: string; detail: string } | { toolId: string }
  ) => DiagnosticErrorPayload;
}

export const defaultOperationalPolicy: OperationalPolicy = {
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

export const defaultPolicy: OperationalPolicy = defaultOperationalPolicy;
