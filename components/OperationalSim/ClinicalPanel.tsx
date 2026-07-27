'use client';

import { useEffect, useRef, useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import {
  EXAM_REGIONS,
  FINDING_SOURCE_LABELS,
  clinicalAction,
  type ClinicalModel,
  type VitalSet,
} from '@/lib/opsim/clinical';
import type { ClinicalActionStatus } from '@/lib/opsim/clinicalMachine';
import type { ResponderRuntime } from '@/lib/opsim/crewMachine';
import {
  createClinicalState,
  canPerform,
  startAction,
  completeAction,
  isComplete,
  applyDeterioration,
  reassessmentVitals,
  reassessmentChanged,
  reorderDifferential,
  removeDifferential,
  markLessLikely,
  setWorkingImpression,
  type ClinicalState,
} from '@/lib/opsim/clinicalMachine';
import type { DifferentialChoice } from '@/lib/opsim/types';
import type { CrewController } from './useCrew';
import opStyles from './OperationalSim.module.css';
import styles from './ClinicalPanel.module.css';

interface ClinicalPanelProps {
  readonly controller: CrewController;
  readonly clock: MissionClock;
  readonly unlocked: boolean;
  readonly model: ClinicalModel;
  readonly initialDifferential: readonly string[];
  readonly differentialChoices: readonly DifferentialChoice[];
  /** Reports the latest clinical state up for run capture (§ Step 10). */
  readonly onStateChange?: (state: ClinicalState) => void;
}

interface ActionControlProps {
  readonly status: ClinicalActionStatus;
  readonly verb: string;
  readonly etaRemaining?: number;
  readonly pickerOpen: boolean;
  readonly freeResponders: readonly ResponderRuntime[];
  readonly blockedMsg?: string;
  readonly onRequest: () => void;
  readonly onPick: (responderId: string) => void;
  readonly onCancelPick: () => void;
}

/** Assign-and-perform control for a clinical action. Module-level so refs/handlers stay out of render. */
function ActionControl({
  status,
  verb,
  etaRemaining,
  pickerOpen,
  freeResponders,
  blockedMsg,
  onRequest,
  onPick,
  onCancelPick,
}: ActionControlProps) {
  if (status === 'complete') return null;
  if (status === 'in_progress') {
    return (
      <div className={styles.actions}>
        <span className={styles.eta}>
          In progress{etaRemaining != null && etaRemaining > 0 ? ` — ${etaRemaining}s` : ''}
        </span>
      </div>
    );
  }
  return (
    <div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onRequest}>
          {verb}
        </button>
      </div>
      {pickerOpen && (
        <div className={styles.picker} aria-label="Choose who performs this">
          <div className={styles.actions}>
            {freeResponders.map((r) => (
              <button key={r.id} type="button" className={styles.button} onClick={() => onPick(r.id)}>
                {r.name}
              </button>
            ))}
            <button type="button" className={styles.button} onClick={onCancelPick}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {blockedMsg && <div className={styles.blocked}>{blockedMsg}</div>}
    </div>
  );
}

function VitalsGrid({ vitals }: { vitals: VitalSet }) {
  const rows: [string, string | undefined][] = [
    ['Heart rate', vitals.hr],
    ['Resp rate', vitals.rr],
    ['Blood pressure', vitals.bp],
    ['SpO₂', vitals.spo2],
    ['Temp', vitals.temp],
    ['Pain', vitals.pain],
  ];
  return (
    <div className={styles.vitalsGrid}>
      {rows.map(([k, v]) =>
        v ? (
          <div key={k} className={styles.vital}>
            <span className={styles.vitalName}>{k}</span>
            <span className={styles.vitalValue}>{v}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

export function ClinicalPanel({
  controller,
  clock,
  unlocked,
  model,
  initialDifferential,
  differentialChoices,
  onStateChange,
}: ClinicalPanelProps) {
  const [clinical, setClinical] = useState<ClinicalState>(() => createClinicalState(initialDifferential));
  const [pick, setPick] = useState<string | null>(null); // actionId awaiting a responder
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const [region, setRegion] = useState<string>('extremities');
  const scheduledRef = useRef<number[]>([]);
  const deteriorationRef = useRef(false);

  // Scenario deterioration, scheduled once patient contact unlocks clinical work.
  useEffect(() => {
    if (!unlocked || deteriorationRef.current) return;
    deteriorationRef.current = true;
    const id = clock.after(model.deteriorationAtSecond, () => setClinical((s) => applyDeterioration(s)));
    scheduledRef.current.push(id);
  }, [unlocked, clock, model]);

  useEffect(() => {
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [clock]);

  useEffect(() => {
    onStateChange?.(clinical);
  }, [clinical, onStateChange]);

  const now = clock.elapsedSeconds();
  const equipmentOnScene = controller.crew.equipmentOnScene;
  const labelFor = (id: string) => differentialChoices.find((c) => c.id === id)?.label ?? id;

  const freeResponders = controller.crew.order
    .map((id) => controller.crew.responders[id])
    .filter((r) => r.onScene && r.status !== 'cleared_from_call' && (!r.assignment || r.assignment.status === 'complete'));

  function requestPerform(actionId: string) {
    const elig = canPerform(clinical, actionId, { unlocked, equipmentOnScene });
    if (!elig.ok) {
      setBlocked((b) => ({ ...b, [actionId]: elig.reason ?? 'Unavailable.' }));
      return;
    }
    setPick(actionId);
    setBlocked((b) => ({ ...b, [actionId]: '' }));
  }

  function pickResponder(responderId: string) {
    if (!pick) return;
    const def = clinicalAction(pick)!;
    const rejected = controller.assign(responderId, def.crewTaskId);
    if (rejected) {
      setBlocked((b) => ({ ...b, [pick]: 'That responder is already busy — pick someone else.' }));
      return;
    }
    setClinical((s) => startAction(s, pick, responderId, now, def.durationSeconds));
    const id = clock.after(def.durationSeconds, () => setClinical((s) => completeAction(s, pick)));
    scheduledRef.current.push(id);
    setPick(null);
  }

  function renderAction(actionId: string, verb: string) {
    const st = clinical.actions[actionId]?.status ?? 'not_started';
    const eta = clinical.actions[actionId]?.etaSecond;
    return (
      <ActionControl
        status={st}
        verb={verb}
        etaRemaining={eta != null ? eta - now : undefined}
        pickerOpen={pick === actionId}
        freeResponders={freeResponders}
        blockedMsg={blocked[actionId]}
        onRequest={() => requestPerform(actionId)}
        onPick={pickResponder}
        onCancelPick={() => setPick(null)}
      />
    );
  }

  function stateChip(actionId: string, equipmentReq?: string) {
    const st = clinical.actions[actionId]?.status ?? 'not_started';
    if (st === 'complete') return <span className={`${styles.stateChip} ${styles.available}`}>Results Available</span>;
    if (st === 'in_progress') return <span className={`${styles.stateChip} ${styles.inProgress}`}>Task in Progress</span>;
    if (equipmentReq && !equipmentOnScene.includes(equipmentReq))
      return <span className={`${styles.stateChip} ${styles.equipment}`}>Equipment Required</span>;
    return <span className={styles.stateChip}>Not Started</span>;
  }

  const init = model.initialAssessment;

  return (
    <section className={opStyles.panel} aria-label="Clinical assessment">
      <h2 className={opStyles.panelTitle}>Clinical assessment</h2>

      {!unlocked && (
        <p className={styles.lockedNote}>
          🔒 Clinical actions are locked until the scene is safe, you exit Medic 3, and patient contact is
          established.
        </p>
      )}

      {unlocked && (
        <>
          {/* Patient Status (initial assessment) */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Patient Status</span>
              {stateChip('initial_assessment')}
            </div>
            {isComplete(clinical, 'initial_assessment') ? (
              <div className={styles.findings}>
                <div className={styles.finding}><span className={styles.findingLabel}>Appearance</span>{init.appearance}</div>
                <div className={styles.finding}><span className={styles.findingLabel}>Responsiveness</span>{init.responsiveness}</div>
                <div className={styles.finding}><span className={styles.findingLabel}>Airway</span>{init.airway}</div>
                <div className={styles.finding}><span className={styles.findingLabel}>Breathing</span>{init.breathing}</div>
                <div className={styles.finding}><span className={styles.findingLabel}>Circulation</span>{init.circulation}</div>
                <div className={styles.finding}><span className={styles.findingLabel}>Immediate life threats</span>{init.lifeThreats}</div>
              </div>
            ) : (
              renderAction('initial_assessment', 'Perform initial assessment')
            )}
          </div>

          {/* Vital Signs */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Vital Signs</span>
              {stateChip('obtain_vitals')}
            </div>
            {isComplete(clinical, 'obtain_vitals') ? <VitalsGrid vitals={model.vitals} /> : renderAction('obtain_vitals', 'Obtain vital signs')}
            <div className={styles.sectionHeader} style={{ marginTop: '0.6rem' }}>
              <span className={styles.sectionTitle} style={{ fontSize: '0.85rem' }}>Blood glucose</span>
              {stateChip('check_glucose', 'als_bag')}
            </div>
            {isComplete(clinical, 'check_glucose') ? (
              <div className={styles.findings}>
                <div className={styles.finding}><span className={styles.source}>{FINDING_SOURCE_LABELS[model.glucose.source]}</span>{model.glucose.text}</div>
              </div>
            ) : (
              renderAction('check_glucose', 'Check blood glucose')
            )}
          </div>

          {/* Patient Interview */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Patient Interview</span>
              {stateChip('interview')}
            </div>
            {isComplete(clinical, 'interview') ? (
              <div className={styles.findings}>
                {model.interview.map((s) => (
                  <div key={s.key} className={styles.finding}>
                    <span className={styles.findingLabel}>{s.label}</span>
                    <span>{s.finding.text}</span>
                    <span className={styles.source}>{FINDING_SOURCE_LABELS[s.finding.source]}</span>
                  </div>
                ))}
              </div>
            ) : (
              renderAction('interview', 'Interview the patient')
            )}
          </div>

          {/* Focused Exam */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Focused Exam</span>
            </div>
            <div className={styles.actions}>
              <label className={styles.vitalName} htmlFor="exam-region">Region</label>
              <select id="exam-region" className={styles.button} value={region} onChange={(e) => setRegion(e.target.value)}>
                {EXAM_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
            {isComplete(clinical, `exam_${region}`) ? (
              <div className={styles.findings}>
                <div className={styles.finding}>
                  <span className={styles.findingLabel}>{EXAM_REGIONS.find((r) => r.id === region)?.label}</span>
                  <span>{model.exam[region]?.text}</span>
                  <span className={styles.source}>{FINDING_SOURCE_LABELS[model.exam[region]?.source ?? 'exam']}</span>
                </div>
              </div>
            ) : (
              renderAction(`exam_${region}`, `Examine ${EXAM_REGIONS.find((r) => r.id === region)?.label}`)
            )}
          </div>

          {/* Cardiac Monitoring */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Cardiac Monitoring</span>
              {stateChip('apply_monitor', 'cardiac_monitor')}
            </div>
            {isComplete(clinical, 'apply_monitor') ? (
              <div className={styles.findings}>
                <div className={styles.finding}><span className={styles.source}>{FINDING_SOURCE_LABELS[model.monitorRhythm.source]}</span>{model.monitorRhythm.text}</div>
              </div>
            ) : (
              renderAction('apply_monitor', 'Apply cardiac monitor')
            )}
            <div className={styles.sectionHeader} style={{ marginTop: '0.6rem' }}>
              <span className={styles.sectionTitle} style={{ fontSize: '0.85rem' }}>12-lead ECG</span>
              {stateChip('obtain_12_lead', 'cardiac_monitor')}
            </div>
            {isComplete(clinical, 'obtain_12_lead') ? (
              <div className={styles.findings}>
                <div className={styles.finding}><span className={styles.source}>{FINDING_SOURCE_LABELS[model.twelveLead.source]}</span>{model.twelveLead.text}</div>
              </div>
            ) : (
              renderAction('obtain_12_lead', 'Obtain 12-lead ECG')
            )}
          </div>

          {/* Reassessment */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Reassessment</span>
              {stateChip('reassess')}
            </div>
            {isComplete(clinical, 'reassess') ? (
              <>
                <VitalsGrid vitals={reassessmentVitals(clinical, model)} />
                {reassessmentChanged(clinical) && <div className={styles.deterioration}>{model.deteriorationNote}</div>}
              </>
            ) : (
              renderAction('reassess', 'Reassess the patient')
            )}
          </div>

          {/* Working Differential */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Working Differential</span>
            </div>
            <ol className={styles.diffList}>
              {clinical.differential.order.map((id, i) => {
                const less = clinical.differential.lessLikely.includes(id);
                const impression = clinical.differential.impression === id;
                return (
                  <li key={id} className={`${styles.diffRow} ${less ? styles.lessLikely : ''} ${impression ? styles.impression : ''}`}>
                    <span className={styles.diffNum}>{i + 1}</span>
                    <span className={styles.diffLabel}>
                      {labelFor(id)} {impression && <span className={styles.impressionTag}>· working impression</span>}
                    </span>
                    <span className={styles.diffButtons}>
                      <button type="button" className={styles.iconBtn} aria-label={`Move ${labelFor(id)} up`} disabled={i === 0} onClick={() => setClinical((s) => reorderDifferential(s, id, 'up', now))}>↑</button>
                      <button type="button" className={styles.iconBtn} aria-label={`Move ${labelFor(id)} down`} disabled={i === clinical.differential.order.length - 1} onClick={() => setClinical((s) => reorderDifferential(s, id, 'down', now))}>↓</button>
                      <button type="button" className={styles.iconBtn} aria-label={`Mark ${labelFor(id)} less likely`} onClick={() => setClinical((s) => markLessLikely(s, id, now))}>–</button>
                      <button type="button" className={styles.iconBtn} aria-label={`Set ${labelFor(id)} as working impression`} onClick={() => setClinical((s) => setWorkingImpression(s, id, now))}>★</button>
                      <button type="button" className={styles.iconBtn} aria-label={`Remove ${labelFor(id)}`} onClick={() => setClinical((s) => removeDifferential(s, id, now))}>✕</button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}
