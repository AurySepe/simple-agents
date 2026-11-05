/**
 * ============================================================================
 * FORMAL AGENT ENGINE (Framework Level 1)
 * ============================================================================
 * Entrypoint pubblico del framework per agenti a stati finiti fortemente tipizzati.
 */

// 1. Tipi e Ontologia Fondamentale
export * from './types/index.js';

// 2. Modello Linguistico M (Adapter)
export * from './adapters/index.js';

// 3. Dominio del Mondo W (Registry)
export * from './world/index.js';

// 4. Universo Introspettivo A_int_universal
export * from './engine/introspective-universe.js';

// 5. Visibilità V_Ω e Proiezione F_Ω
export * from './engine/projection.js';

// 6. Motore di Transizione Ω (Orchestratore)
export * from './engine/orchestrator.js';

// 7. Moduli di Default e Standard Library di Livello 1
export * from './defaults/index.js';

// 8. Osservabilità, Logger e Telemetria
export * from './observability/index.js';

