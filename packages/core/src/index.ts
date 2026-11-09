/**
 * ============================================================================
 * FORMAL AGENT ENGINE (@formal-agent/core)
 * ============================================================================
 * Micro-kernel FSM per agenti autonomi a stati finiti fortemente tipizzati.
 * Disaccoppiamento ortogonale di Livello 1 (Framework invariante).
 */

// 1. Tipi e Ontologia Fondamentale
export * from './types/index.js';

// 2. Dominio del Mondo W (Registry)
export * from './world/index.js';

// 3. Visibilità V_Ω e Proiezione F_Ω
export * from './engine/projection.js';

// 4. Motore di Transizione Ω (Orchestratore)
export * from './engine/orchestrator.js';

// 5. Moduli di Default e Standard Library di Livello 1
export * from './defaults/index.js';

// 6. Osservabilità, Logger e Telemetria
export * from './observability/index.js';

// 7. API Dichiarativa e Type-Safe per la Definizione e Binding dell'Agente
export * from './definition/index.js';


