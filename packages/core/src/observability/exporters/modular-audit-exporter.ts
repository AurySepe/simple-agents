import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import {
  AgentEvent,
  HaltEvent,
  ModelInferenceEvent,
  StateTransitionEvent,
  WorldActionEvent,
  YieldEvent
} from '../events.js';
import { InMemoryTelemetryCollector } from '../collectors/in-memory-collector.js';
import { DataRecord, DataValue, Message, ToolDefinition, ToolResult } from '../../types/index.js';

function serializeZodSchema(schema: unknown): Record<string, unknown> | string {
  try {
    if (schema instanceof z.ZodType) {
      return z.toJSONSchema(schema) as Record<string, unknown>;
    }
    return String(schema);
  } catch {
    return 'schema';
  }
}

function serializeKa(
  kaMap?: Map<string, { descrizione: string; corpo: string }>
): Record<string, { descrizione: string; corpo: string }> {
  if (!kaMap) return {};
  const obj: Record<string, { descrizione: string; corpo: string }> = {};
  for (const [id, c] of kaMap.entries()) {
    obj[id] = {
      descrizione: c.descrizione,
      corpo: c.corpo
    };
  }
  return obj;
}

export interface ModularExportOptions {
  outputDir: string;
  scenarioName?: string;
  generateHtmlDashboard?: boolean;
}

export interface StateAuditSnapshot {
  scopo_Ms: string;
  memoria_Ds: DataRecord;
  tool_attivi_Ta: string[];
  policy_attive_Ka: Record<string, { descrizione: string; corpo: string }>;
  messaggi_in_cronologia: number;
}

export interface PhaseGroup {
  phaseIndex: number;
  macroCycle: number;
  fsmControlState: string;
  phaseLabel: string;
  folderName: string;
  steps: StepAuditData[];
  initialState: StateAuditSnapshot;
  finalState: StateAuditSnapshot;
  actionsExecuted: Array<{ step: number; tool: string; payload: DataRecord }>;
}

export interface StepAuditData {
  coordinate: {
    stepNumber: number;
    macroCycle: number;
    tick: number;
    fsmControlState: string;
    phaseLabel: string;
  };
  statoAgentePrimaDelPasso: StateAuditSnapshot;
  inputGrezzoPassatoAlModello: {
    systemFrame: string;
    messagesHistory: Array<{
      index: number;
      tau?: { c: number; t: number };
      type: string;
      callId?: string;
      content: Message['content'];
    }>;
    visibleToolsMask: Array<{
      id: string;
      description: string;
      parametersSchema: Record<string, unknown> | string;
    }>;
  };
  outputGrezzoDalModello: {
    durataMs: number;
    thought?: string;
    calls: Array<{
      id: string;
      name: string;
      payload: DataRecord;
    }>;
  };
  esitoEsecuzioneNelMondo: Array<{
    toolId: string;
    parametriInviati: DataRecord;
    risultatoRicevuto?: ToolResult;
    errore?: string;
    durataMs: number;
  }>;
  transizioneDiStato?: {
    from: string;
    to: string;
    motivoCodice: string;
    context?: DataRecord;
  };
  statoAgenteDopoIlPasso: StateAuditSnapshot;
}

/**
 * ============================================================================
 * ESPORTATORE AUDIT MODULARE (ModularAuditExporter)
 * ============================================================================
 * Suddivide l'audit sia per Fasi FSM che per singoli Step, serializzando i valori
 * grezzi reali (senza parafrasi) per una completa e immediata ispezionabilità.
 */
export class ModularAuditExporter {
  public static export(
    collector: InMemoryTelemetryCollector,
    options: ModularExportOptions
  ): {
    outputDir: string;
    phasesCount: number;
    stepsCount: number;
    indexFilePath: string;
    htmlDashboardPath?: string;
  } {
    const events = collector.getEvents();
    const outputDir = path.resolve(options.outputDir);

    // Assicura directory radice
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const phasesDir = path.join(outputDir, 'phases');
    if (!fs.existsSync(phasesDir)) {
      fs.mkdirSync(phasesDir, { recursive: true });
    }

    const inferences = collector.filterByType('model_inference');
    const worldActions = collector.filterByType('world_action');
    const transitions = collector.filterByType('state_transition');
    const halts = collector.filterByType('halt');

    // 1. Costruzione dei dati di audit per ciascun micro-passo
    const stepDataList: StepAuditData[] = inferences.map((inf, idx) => {
      const stepNumber = idx + 1;
      const stepTick = inf.tick;
      const stepCycle = inf.macroCycle;

      // Transition di questo step
      const stepTrans = transitions.find(
        (t) => t.tick === stepTick && t.macroCycle === stepCycle
      );

      // World actions associate a questo step o yield successivo
      const stepWorld = worldActions.filter(
        (w) => w.tick === stepTick || w.macroCycle === stepCycle
      );

      const haltEvent = halts.find((h) => h.tick === stepTick);
      const afterSnapshot = haltEvent
        ? haltEvent.stateSnapshot
        : inf.stateSnapshot;

      return {
        coordinate: {
          stepNumber,
          macroCycle: stepCycle,
          tick: stepTick,
          fsmControlState: inf.controlState,
          phaseLabel:
            inf.controlState === 'q_exec'
              ? 'Azione operativa (Esecuzione nel Mondo)'
              : inf.controlState === 'q_repair'
              ? 'Riparazione automatica'
              : inf.controlState
        },
        statoAgentePrimaDelPasso: {
          scopo_Ms: inf.stateSnapshot.Ms,
          memoria_Ds: { ...inf.stateSnapshot.Ds },
          tool_attivi_Ta: Array.from(inf.stateSnapshot.Ta),
          policy_attive_Ka: serializeKa(inf.stateSnapshot.Ka),
          messaggi_in_cronologia: inf.stateSnapshot.Ep.length
        },
        inputGrezzoPassatoAlModello: {
          systemFrame: inf.context.systemFrame,
          messagesHistory: inf.context.messages.map((m) => ({
            index: m.index,
            tau: m.tau,
            type: m.type,
            callId: m.callId,
            content: m.content
          })),
          visibleToolsMask: inf.context.visibleTools.map((t) => ({
            id: t.id,
            description: t.description,
            parametersSchema: serializeZodSchema(t.parameters)
          }))
        },
        outputGrezzoDalModello: {
          durataMs: inf.durationMs,
          status: inf.output.status ?? 'success',
          thought: inf.output.status === 'stall' ? inf.output.stall.partialThought : inf.output.thought,
          calls:
            inf.output.status === 'stall'
              ? []
              : inf.output.calls.map((c) => ({
                  id: c.id,
                  name: c.name,
                  payload: c.payload
                })),
          stall: inf.output.status === 'stall' ? inf.output.stall : undefined
        },
        esitoEsecuzioneNelMondo:
          inf.controlState === 'q_exec'
            ? stepWorld.map((w) => ({
                toolId: w.toolId,
                parametriInviati: w.args,
                risultatoRicevuto: w.status === 'success' ? w.result : undefined,
                errore: w.status === 'failure' ? (w.error instanceof Error ? w.error.message : String(w.error)) : undefined,
                durataMs: w.durationMs
              }))
            : [],
        transizioneDiStato: stepTrans
          ? {
              from: stepTrans.from,
              to: stepTrans.to,
              motivoCodice: stepTrans.reasonCode,
              context: stepTrans.context
            }
          : undefined,
        statoAgenteDopoIlPasso: {
          scopo_Ms: afterSnapshot.Ms,
          memoria_Ds: { ...afterSnapshot.Ds },
          tool_attivi_Ta: Array.from(afterSnapshot.Ta),
          policy_attive_Ka: serializeKa(afterSnapshot.Ka),
          messaggi_in_cronologia: afterSnapshot.Ep.length
        }
      };
    });

    // 2. Raggruppamento per Fasi FSM del modello
    const phaseGroups: PhaseGroup[] = [];
    let currentPhase: PhaseGroup | null = null;
    let phaseCounter = 0;

    for (const stepData of stepDataList) {
      const state = stepData.coordinate.fsmControlState;
      const cycle = stepData.coordinate.macroCycle;

      if (!currentPhase || currentPhase.fsmControlState !== state || currentPhase.macroCycle !== cycle) {
        phaseCounter++;
        const padIndex = String(phaseCounter).padStart(2, '0');
        const phaseFolderName: string = `${padIndex}_cycle${cycle}_${state}`;

        const newPhase: PhaseGroup = {
          phaseIndex: phaseCounter,
          macroCycle: cycle,
          fsmControlState: state,
          phaseLabel: stepData.coordinate.phaseLabel,
          folderName: phaseFolderName,
          steps: [],
          initialState: stepData.statoAgentePrimaDelPasso,
          finalState: stepData.statoAgenteDopoIlPasso,
          actionsExecuted: []
        };
        phaseGroups.push(newPhase);
        currentPhase = newPhase;
      }

      currentPhase.steps.push(stepData);
      currentPhase.finalState = stepData.statoAgenteDopoIlPasso;
      for (const call of stepData.outputGrezzoDalModello.calls) {
        currentPhase.actionsExecuted.push({
          step: stepData.coordinate.stepNumber,
          tool: call.name,
          payload: call.payload
        });
      }
    }

    // 3. Scrittura su disco dei file di fase e dei singoli step_XX.json
    for (const phase of phaseGroups) {
      const phaseDir = path.join(phasesDir, phase.folderName);
      if (!fs.existsSync(phaseDir)) {
        fs.mkdirSync(phaseDir, { recursive: true });
      }

      // Scrittura dei file di step
      const stepFileNames: string[] = [];
      for (const step of phase.steps) {
        const stepPad = String(step.coordinate.stepNumber).padStart(2, '0');
        const fileName = `step_${stepPad}.json`;
        stepFileNames.push(fileName);
        fs.writeFileSync(
          path.join(phaseDir, fileName),
          JSON.stringify(step, null, 2),
          'utf8'
        );
      }

      // Scrittura del phase_summary.json
      const phaseSummary = {
        phaseIndex: phase.phaseIndex,
        macroCycle: phase.macroCycle,
        fsmControlState: phase.fsmControlState,
        phaseLabel: phase.phaseLabel,
        stepCount: phase.steps.length,
        stepsIncluded: stepFileNames,
        statoInizialeFase: phase.initialState,
        statoFinaleFase: phase.finalState,
        deltaStato: {
          scopoModificato: phase.initialState.scopo_Ms !== phase.finalState.scopo_Ms,
          scopoFinale: phase.finalState.scopo_Ms,
          toolFinaliInTa: phase.finalState.tool_attivi_Ta,
          datiFinaliInDs: phase.finalState.memoria_Ds
        },
        azioniEseguite: phase.actionsExecuted
      };

      fs.writeFileSync(
        path.join(phaseDir, 'phase_summary.json'),
        JSON.stringify(phaseSummary, null, 2),
        'utf8'
      );
    }

    // 4. Scrittura del file principale di indice: index.json
    const haltEvent = halts[0];
    const indexData = {
      scenario: options.scenarioName ?? 'Audit Esecuzione Agente',
      generatedAt: new Date().toISOString(),
      statisticheGenerali: {
        totalePassi: stepDataList.length,
        totaleFasiFSM: phaseGroups.length,
        totaleMacroCicli: inferences.length > 0 ? inferences[inferences.length - 1].macroCycle + 1 : 1,
        statoTerminazione: haltEvent ? 'q_halt' : 'running',
        contrattoUscita: haltEvent?.result?.type ?? 'incompleto',
        datiUscitaFinale: haltEvent?.result?.payload ?? null
      },
      statoInizialeGlobale: stepDataList[0]?.statoAgentePrimaDelPasso ?? {},
      statoFinaleGlobale: stepDataList[stepDataList.length - 1]?.statoAgenteDopoIlPasso ?? {},
      mappaFasiFSM: phaseGroups.map((p) => ({
        faseIndex: p.phaseIndex,
        macroCiclo: p.macroCycle,
        statoFSM: p.fsmControlState,
        etichettaFase: p.phaseLabel,
        cartellaRelativa: `phases/${p.folderName}`,
        fileRiepilogo: `phases/${p.folderName}/phase_summary.json`,
        filePassi: p.steps.map((s) => `phases/${p.folderName}/step_${String(s.coordinate.stepNumber).padStart(2, '0')}.json`),
        deltaStato: {
          scopo: p.finalState.scopo_Ms,
          toolMontati: p.finalState.tool_attivi_Ta
        },
        azioniEseguite: p.actionsExecuted.map((a) => `${a.tool}`)
      }))
    };

    fs.writeFileSync(
      path.join(outputDir, 'index.json'),
      JSON.stringify(indexData, null, 2),
      'utf8'
    );

    // 5. Dashboard HTML interattiva (opzionale o predefinita)
    if (options.generateHtmlDashboard !== false) {
      const htmlContent = generateDashboardHtml(indexData, phaseGroups, stepDataList);
      fs.writeFileSync(path.join(outputDir, 'index.html'), htmlContent, 'utf8');
    }

    return {
      outputDir,
      phasesCount: phaseGroups.length,
      stepsCount: stepDataList.length,
      indexFilePath: path.join(outputDir, 'index.json'),
      htmlDashboardPath: options.generateHtmlDashboard !== false ? path.join(outputDir, 'index.html') : undefined
    };
  }
}

export interface AuditIndexData {
  scenario: string;
  generatedAt: string;
  statisticheGenerali: {
    totalePassi: number;
    totaleFasiFSM: number;
    totaleMacroCicli: number;
    statoTerminazione: string;
    contrattoUscita: string;
    datiUscitaFinale: unknown;
  };
  statoInizialeGlobale: StateAuditSnapshot | Record<string, never>;
  statoFinaleGlobale: StateAuditSnapshot | Record<string, never>;
  mappaFasiFSM: Array<{
    faseIndex: number;
    macroCiclo: number;
    statoFSM: string;
    etichettaFase: string;
    cartellaRelativa: string;
    fileRiepilogo: string;
    filePassi: string[];
    deltaStato: {
      scopo: string;
      toolMontati: string[];
    };
    azioniEseguite: string[];
  }>;
}

/**
 * Genera una dashboard HTML monopagina, autonoma (senza server) per navigare
 * a colpo d'occhio e con ispettore JSON su ogni passo e sotto-stato.
 */
function generateDashboardHtml(
  indexData: AuditIndexData,
  phaseGroups: PhaseGroup[],
  steps: StepAuditData[]
): string {
  const stepsJsonString = JSON.stringify(steps).replace(/</g, '\\u003c');
  const indexJsonString = JSON.stringify(indexData).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Agent Execution Audit Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --green: #4ade80;
      --yellow: #facc15;
      --purple: #c084fc;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
    #sidebar { width: 340px; background: var(--card-bg); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    #sidebar-header { padding: 18px; border-bottom: 1px solid var(--border); }
    #sidebar-header h2 { font-size: 16px; color: var(--accent); }
    #sidebar-header p { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
    #tree { overflow-y: auto; flex: 1; padding: 10px; }
    .phase-node { margin-bottom: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .phase-title { padding: 8px 12px; font-size: 12px; font-weight: bold; background: rgba(56, 189, 248, 0.08); color: var(--accent); display: flex; justify-content: space-between; }
    .step-item { padding: 8px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; }
    .step-item:hover { background: rgba(56, 189, 248, 0.15); }
    .step-item.active { background: var(--accent); color: #000; font-weight: bold; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); }
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #top-bar { padding: 16px 24px; border-bottom: 1px solid var(--border); background: var(--card-bg); display: flex; justify-content: space-between; align-items: center; }
    .tabs { display: flex; gap: 8px; }
    .tab-btn { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .tab-btn.active { background: var(--accent); color: #000; font-weight: bold; border-color: var(--accent); }
    #content { flex: 1; overflow-y: auto; padding: 24px; }
    pre { background: var(--code-bg); padding: 16px; border-radius: 6px; border: 1px solid var(--border); overflow-x: auto; font-size: 13px; color: #e2e8f0; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
    .panel { display: none; }
    .panel.active { display: block; }
    .field-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .field-card h3 { font-size: 14px; color: var(--accent); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
  </style>
</head>
<body>
  <div id="sidebar">
    <div id="sidebar-header">
      <h2>🔍 Audit Ispettore FSM</h2>
      <p id="scenario-label">Caricamento...</p>
    </div>
    <div id="tree"></div>
  </div>

  <div id="main">
    <div id="top-bar">
      <div>
        <h1 id="step-title" style="font-size: 18px;">Seleziona un passo</h1>
        <p id="step-subtitle" style="font-size: 12px; color: var(--text-muted); margin-top: 4px;"></p>
      </div>
      <div class="tabs">
        <button class="tab-btn active" onclick="switchTab('input')">📥 Input Reale Modello</button>
        <button class="tab-btn" onclick="switchTab('output')">💭 Output & Chiamate</button>
        <button class="tab-btn" onclick="switchTab('state')">🧠 Stato Agente (Prima/Dopo)</button>
        <button class="tab-btn" onclick="switchTab('raw')">📄 JSON Completo Passo</button>
      </div>
    </div>

    <div id="content">
      <div id="panel-input" class="panel active">
        <div class="field-card">
          <h3>🎯 Direttiva Reale Inviata</h3>
          <pre id="directive-box"></pre>
        </div>
        <div class="field-card">
          <h3>📄 Frame di Sistema (F_Ω Proiettato)</h3>
          <pre id="system-frame-box"></pre>
        </div>
        <div class="field-card">
          <h3>💬 Cronologia Messaggi (E_p Reale)</h3>
          <pre id="messages-box"></pre>
        </div>
        <div class="field-card">
          <h3>🛠️ Maschera Strumenti Visibili (V_Ω)</h3>
          <pre id="tools-box"></pre>
        </div>
      </div>

      <div id="panel-output" class="panel">
        <div class="field-card">
          <h3>💭 Flusso di Coscienza (Thought)</h3>
          <pre id="thought-box" style="color: var(--yellow);"></pre>
        </div>
        <div class="field-card">
          <h3>⚡ Chiamate e Payload Emessi</h3>
          <pre id="calls-box" style="color: var(--green);"></pre>
        </div>
        <div class="field-card" id="world-card" style="display: none;">
          <h3>🌍 Risultati Esecuzione Mondo W</h3>
          <pre id="world-box"></pre>
        </div>
      </div>

      <div id="panel-state" class="panel">
        <div class="field-card">
          <h3>🧠 Stato Agente Prima del Passo</h3>
          <pre id="state-before-box"></pre>
        </div>
        <div class="field-card">
          <h3>🔄 Stato Agente Dopo il Passo</h3>
          <pre id="state-after-box"></pre>
        </div>
      </div>

      <div id="panel-raw" class="panel">
        <div class="field-card">
          <h3>📦 JSON Integrale del Passo</h3>
          <pre id="raw-box"></pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    const STEPS = ${stepsJsonString};
    const INDEX = ${indexJsonString};
    let currentStepIdx = 0;

    document.getElementById('scenario-label').innerText = INDEX.scenario + ' (' + STEPS.length + ' passi totali)';

    function renderTree() {
      const tree = document.getElementById('tree');
      tree.innerHTML = '';

      INDEX.mappaFasiFSM.forEach((phase) => {
        const pNode = document.createElement('div');
        pNode.className = 'phase-node';

        const pTitle = document.createElement('div');
        pTitle.className = 'phase-title';
        pTitle.innerHTML = '<span>' + phase.statoFSM + '</span> <span class="badge">Ciclo ' + phase.macroCiclo + '</span>';
        pNode.appendChild(pTitle);

        phase.filePassi.forEach((path) => {
          const match = path.match(/step_(\\d+)\\.json/);
          if (match) {
            const stepNum = parseInt(match[1], 10);
            const stepObj = STEPS.find(s => s.coordinate.stepNumber === stepNum);
            if (stepObj) {
              const item = document.createElement('div');
              item.className = 'step-item' + (stepObj.coordinate.stepNumber === 1 ? ' active' : '');
              item.id = 'step-btn-' + stepObj.coordinate.stepNumber;
              const callNames = stepObj.outputGrezzoDalModello.calls.map(c => c.name).join(', ') || 'nessuna';
              item.innerHTML = '<span>Passo ' + stepObj.coordinate.stepNumber + '</span> <span class="badge">' + callNames + '</span>';
              item.onclick = () => selectStep(stepObj.coordinate.stepNumber - 1);
              pNode.appendChild(item);
            }
          }
        });

        tree.appendChild(pNode);
      });
    }

    function selectStep(idx) {
      currentStepIdx = idx;
      const s = STEPS[idx];

      document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
      const activeBtn = document.getElementById('step-btn-' + s.coordinate.stepNumber);
      if (activeBtn) activeBtn.classList.add('active');

      document.getElementById('step-title').innerText = 'Passo ' + s.coordinate.stepNumber + ' • ' + s.coordinate.phaseLabel;
      document.getElementById('step-subtitle').innerText = 'Macro-Ciclo ' + s.coordinate.macroCycle + ' • Tick ' + s.coordinate.tick + ' • Fase ' + s.coordinate.fsmControlState;

      document.getElementById('directive-box').innerText = JSON.stringify(s.direttivaReale, null, 2);
      document.getElementById('system-frame-box').innerText = s.inputGrezzoPassatoAlModello.systemFrame;
      document.getElementById('messages-box').innerText = JSON.stringify(s.inputGrezzoPassatoAlModello.messagesHistory, null, 2);
      document.getElementById('tools-box').innerText = JSON.stringify(s.inputGrezzoPassatoAlModello.visibleToolsMask, null, 2);

      document.getElementById('thought-box').innerText = s.outputGrezzoDalModello.thought || '(Nessun thought emesso)';
      document.getElementById('calls-box').innerText = JSON.stringify(s.outputGrezzoDalModello.calls, null, 2);

      const worldCard = document.getElementById('world-card');
      if (s.esitoEsecuzioneNelMondo && s.esitoEsecuzioneNelMondo.length > 0) {
        worldCard.style.display = 'block';
        document.getElementById('world-box').innerText = JSON.stringify(s.esitoEsecuzioneNelMondo, null, 2);
      } else {
        worldCard.style.display = 'none';
      }

      document.getElementById('state-before-box').innerText = JSON.stringify(s.statoAgentePrimaDelPasso, null, 2);
      document.getElementById('state-after-box').innerText = JSON.stringify(s.statoAgenteDopoIlPasso, null, 2);

      document.getElementById('raw-box').innerText = JSON.stringify(s, null, 2);
    }

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

      event.target.classList.add('active');
      document.getElementById('panel-' + tabId).classList.add('active');
    }

    renderTree();
    selectStep(0);
  </script>
</body>
</html>`;
}
