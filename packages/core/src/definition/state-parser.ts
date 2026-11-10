import { z } from 'zod';
import {
  ActiveFSMState,
  AgentState,
  Concept,
  DataRecord,
  DataValue,
  DiagnosticErrorPayload,
  ExitResult,
  isDataRecord,
  Message,
  TerminationContract,
  TimeIndex,
  ValidToolCall
} from '../types/index.js';
import {
  AgentContract,
  StateParseError,
  StateParseErrorCode,
  StateParseResult,
  ToolContract,
  TypedAgentState
} from './types.js';

export type { StateParseError, StateParseErrorCode, StateParseResult };

/**
 * ============================================================================
 * ERRORE STRUTTURATO DI VALIDAZIONE DELLO STATO DELL'AGENTE
 * ============================================================================
 */
export class StateValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'StateValidationError';
  }
}

/**
 * ============================================================================
 * TIPO DELLO STATO FORTEMENTE TIPIZZATO SUL CONTRATTO
 * ============================================================================
 */
export type { TypedAgentState };

/**
 * ============================================================================
 * DERIVAZIONE DELLE COORDINATE TEMPORALI: τ = <c, t>
 * ============================================================================
 * Estrae l'indice temporale dall'ultimo messaggio presente in Ep.
 * Se la cronologia è vuota, ritorna il tempo iniziale <0, 0>.
 */
export function deriveTimeIndex(messages: Message[]): TimeIndex {
  if (!messages || messages.length === 0) {
    return { c: 0, t: 0 };
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.tau && typeof msg.tau.c === 'number' && typeof msg.tau.t === 'number') {
      let t = msg.tau.t;
      // Se l'ultimo messaggio è un'azione (action), il tick di inferenza che l'ha emessa
      // si è concluso e il contatore decisionale dell'automa è avanzato a t + 1.
      if (msg.type === 'action') {
        t = t + 1;
      }
      return { c: msg.tau.c, t };
    }
  }

  return { c: 0, t: 0 };
}

/**
 * ============================================================================
 * DERIVAZIONE DETERMINISTICA DELLO STATO DELL'AUTOMA: Q = deriveFSMState(S)
 * ============================================================================
 * Calcola la fase attiva dell'automa FSM a partire esclusivamente dallo stato S
 * e dai contratti di terminazione dell'agente.
 *
 * Regole di proiezione:
 * 1. Ep vuoto o privo di stimoli esogeni -> q_sleep
 * 2. Ultima azione è una terminazione valida (a_term in A_term) -> q_halt
 * 3. Chiamate fisiche action (Y ⊆ Ta) senza rispettivo evento result -> q_yield
 * 4. Ultimo evento è un result di errore diagnostico -> q_repair
 * 5. Tutti gli altri casi (stimulus, result positivo, ecc.) -> q_exec
 */
export function deriveFSMState<TTerm = DataValue>(
  state: AgentState,
  terminations: TerminationContract<TTerm>[] = []
): ActiveFSMState<TTerm> {
  const ep = state.Ep ?? [];
  if (ep.length === 0) {
    return { phase: 'q_sleep' };
  }

  const terminationIds = new Set(terminations.map((t) => t.id));

  // 1. Verifica se l'ultimo messaggio è un'azione terminale valida (q_halt)
  const lastMsg = ep[ep.length - 1];
  if (lastMsg.type === 'action' && terminationIds.has(lastMsg.content.name)) {
    const termContract = terminations.find((t) => t.id === lastMsg.content.name);
    const rawPayload = lastMsg.content.payload;
    let validatedPayload: any = rawPayload;
    if (termContract) {
      const parsed = termContract.schema.safeParse(rawPayload);
      if (parsed.success) {
        validatedPayload = parsed.data;
      }
    }

    const exitResult: ExitResult<TTerm> = {
      type: lastMsg.content.name,
      payload: validatedPayload as TTerm
    };
    return { phase: 'q_halt', exitResult };
  }

  // 2. Calcola le azioni 'action' pendenti prive di rispettivo evento 'result' con lo stesso callId
  const resultCallIds = new Set<string>();
  for (const msg of ep) {
    if (msg.type === 'result' && msg.callId) {
      resultCallIds.add(msg.callId);
    }
  }

  const pendingWorldCalls: ValidToolCall[] = [];
  for (const msg of ep) {
    if (msg.type === 'action' && msg.callId && !resultCallIds.has(msg.callId)) {
      // Le azioni terminali non sono chiamate pendenti verso il mondo
      if (!terminationIds.has(msg.content.name)) {
        pendingWorldCalls.push({
          status: 'valid',
          id: msg.callId,
          name: msg.content.name,
          payload: msg.content.payload
        });
      }
    }
  }

  // Se ci sono chiamate al mondo fisiche non ancora risolte -> q_yield
  if (pendingWorldCalls.length > 0) {
    return {
      phase: 'q_yield',
      pendingCalls: pendingWorldCalls
    };
  }

  // 3. Se l'ultimo messaggio è un errore diagnostico su result -> q_repair
  if (lastMsg.type === 'result') {
    const content = lastMsg.content as DiagnosticErrorPayload | undefined;
    if (content && typeof content === 'object' && 'status' in content && content.status === 'error') {
      // Cerca l'azione corrispondente per ricavare il targetToolId
      let targetToolId = 'unknown';
      for (let i = ep.length - 2; i >= 0; i--) {
        const prev = ep[i];
        if (prev.type === 'action' && prev.callId === lastMsg.callId) {
          targetToolId = prev.content.name;
          break;
        }
      }
      return {
        phase: 'q_repair',
        targetToolId,
        targetCallId: lastMsg.callId
      };
    }
  }

  // 4. Se la traccia non contiene alcuno stimolo esogeno ('stimulus') -> q_sleep
  const hasStimulus = ep.some((m) => m.type === 'stimulus');
  if (!hasStimulus) {
    return { phase: 'q_sleep' };
  }

  // 5. In tutti gli altri casi l'agente è operativo e pronto per l'inferenza -> q_exec
  return { phase: 'q_exec' };
}

/**
 * ============================================================================
 * FACTORY DEL PARSER DELLO STATO: createAgentStateParser
 * ============================================================================
 * Compone automaticamente un validatore type-safe a partire dalla specifica
 * dell'AgentContract, restituendo un Result tipizzato (StateParseResult)
 * senza mai lanciare eccezioni.
 */
export function createAgentStateParser<
  TTools extends Record<string, ToolContract>,
  TStateSchema extends z.ZodType | undefined = undefined,
  TTerminations extends Record<string, any> = Record<string, any>
>(
  contract: AgentContract<TTools, TStateSchema, TTerminations>
): (raw: unknown) => StateParseResult<TTools, TStateSchema> {
  const allowedToolKeys = new Set(Object.keys(contract.tools ?? {}));

  return function parseState(raw: unknown): StateParseResult<TTools, TStateSchema> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {
        ok: false,
        error: {
          code: 'NOT_AN_OBJECT',
          message: 'Agent state must be a non-null object.'
        }
      };
    }
    const candidate: any = raw;

    // 1. Validazione Identità (I) e Missione (Ms)
    if (typeof candidate.I !== 'string' || candidate.I.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'INVALID_IDENTITY',
          message: "Missing or invalid agent identity 'I' (must be a non-empty string)."
        }
      };
    }
    if (typeof candidate.Ms !== 'string') {
      return {
        ok: false,
        error: {
          code: 'INVALID_MISSION',
          message: "Missing or invalid agent mission 'Ms' (must be a string)."
        }
      };
    }

    // 2. Validazione Memoria Dati (Ds)
    let validatedDs: any = candidate.Ds ?? {};
    if (contract.stateSchema) {
      const parsedDs = contract.stateSchema.safeParse(candidate.Ds);
      if (!parsedDs.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_VIOLATION',
            message: `Agent state 'Ds' does not conform to the contract 'stateSchema': ${parsedDs.error.message}`,
            details: parsedDs.error.format()
          }
        };
      }
      validatedDs = parsedDs.data;
    } else {
      if (!isDataRecord(validatedDs)) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_VIOLATION',
            message: "Agent state 'Ds' must be a structured key-value record."
          }
        };
      }
    }

    // 3. Validazione Toolbelt (Ta) - supporta sia Array che Set (da runtime AgentState)
    const rawTa = candidate.Ta instanceof Set ? Array.from(candidate.Ta) : candidate.Ta;
    if (!Array.isArray(rawTa)) {
      return {
        ok: false,
        error: {
          code: 'UNDECLARED_TOOL',
          message: "Agent state 'Ta' must be an array of tool ID strings."
        }
      };
    }
    for (const toolId of rawTa) {
      if (typeof toolId !== 'string') {
        return {
          ok: false,
          error: {
            code: 'UNDECLARED_TOOL',
            message: `Found non-string tool ID in 'Ta': ${String(toolId)}`
          }
        };
      }
      if (!allowedToolKeys.has(toolId)) {
        return {
          ok: false,
          error: {
            code: 'UNDECLARED_TOOL',
            message: `Tool '${toolId}' in 'Ta' is not declared in the agent contract tools.`
          }
        };
      }
    }

    // 4. Validazione Conoscenze (Ka) - supporta sia Array che Map (da runtime AgentState)
    let validatedKa: Concept[] = [];
    if (candidate.Ka !== undefined && candidate.Ka !== null) {
      const rawKa = candidate.Ka instanceof Map ? Array.from(candidate.Ka.values()) : candidate.Ka;
      if (!Array.isArray(rawKa)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_KNOWLEDGE',
            message: "Agent state 'Ka' must be an array of Concept objects."
          }
        };
      }
      for (const [idx, item] of rawKa.entries()) {
        if (!item || typeof item.name !== 'string' || typeof item.descrizione !== 'string' || typeof item.corpo !== 'string') {
          return {
            ok: false,
            error: {
              code: 'INVALID_KNOWLEDGE',
              message: `Knowledge concept at index ${idx} must have 'name', 'descrizione' and 'corpo' string properties.`
            }
          };
        }
      }
      validatedKa = rawKa;
    }

    // 5. Validazione Traccia Episodica (Ep)
    if (!Array.isArray(candidate.Ep)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_EPISODIC_LOG',
          message: "Agent state 'Ep' must be an array of episodic messages."
        }
      };
    }
    for (const [idx, msg] of candidate.Ep.entries()) {
      if (!msg || typeof msg !== 'object') {
        return {
          ok: false,
          error: {
            code: 'INVALID_EPISODIC_LOG',
            message: `Episodic event at index ${idx} must be a valid message object.`
          }
        };
      }
      if (!['stimulus', 'thought', 'action', 'result'].includes(msg.type)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_EPISODIC_LOG',
            message: `Episodic event at index ${idx} has invalid event type '${msg.type}'.`
          }
        };
      }
    }

    return {
      ok: true,
      state: {
        I: candidate.I,
        Ms: candidate.Ms,
        Ds: validatedDs,
        Ta: rawTa as (keyof TTools & string)[],
        Ka: validatedKa,
        Ep: candidate.Ep as Message[]
      }
    };
  };
}
