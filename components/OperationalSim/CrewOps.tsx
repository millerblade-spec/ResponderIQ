'use client';

import { useState } from 'react';
import type { MissionClock } from '@/lib/engine/missionClock';
import {
  EQUIPMENT_TASKS,
  PATIENT_CARE_TASKS,
  SCENE_OPS_TASKS,
  RESOURCE_OPTIONS,
  RON_CREW_LINES,
  STATUS_LABELS,
  equipmentLabelForTask,
  taskDef,
} from '@/lib/opsim/crew';
import type { CrewController } from './useCrew';
import type { ResponderRuntime } from '@/lib/opsim/crewMachine';
import opStyles from './OperationalSim.module.css';
import styles from './CrewOps.module.css';

interface CrewOpsProps {
  readonly controller: CrewController;
  readonly clock: MissionClock;
}

const TASK_GROUPS = [
  { title: 'Equipment', tasks: EQUIPMENT_TASKS },
  { title: 'Patient care', tasks: PATIENT_CARE_TASKS },
  { title: 'Scene operations', tasks: SCENE_OPS_TASKS },
];

function fmt(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function rejectionMessage(reason: string, taskId: string): string {
  switch (reason) {
    case 'busy':
      return 'That responder already has an active task.';
    case 'cleared':
      return 'That responder has been cleared from the call.';
    case 'safety':
      return 'The fire officer won’t send the crew through an uncontrolled hazard.';
    case 'already_on_scene':
      return `${equipmentLabelForTask(taskId)} is already available on scene.`;
    default:
      return 'That assignment isn’t available.';
  }
}

/**
 * Crew-resource management panel (§10–§14). Presentational: it reads and mutates
 * the shared crew via the CrewController, so Scene Dynamics and this panel act
 * on the same personnel.
 */
export function CrewOps({ controller, clock }: CrewOpsProps) {
  const { crew } = controller;
  const [selected, setSelected] = useState<string | null>(null);
  const [reassignFrom, setReassignFrom] = useState<string | null>(null);
  const [showResources, setShowResources] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});

  function doAssign(responderId: string, taskId: string) {
    const rejected = controller.assign(responderId, taskId);
    if (rejected) {
      setBlocked((b) => ({ ...b, [responderId]: rejectionMessage(rejected, taskId) }));
      return;
    }
    setSelected(null);
    setBlocked((b) => ({ ...b, [responderId]: '' }));
  }

  function handleResponderClick(r: ResponderRuntime) {
    if (reassignFrom && reassignFrom !== r.id) {
      controller.reassign(reassignFrom, r.id);
      setReassignFrom(null);
      return;
    }
    setSelected((cur) => (cur === r.id ? null : r.id));
  }

  function handleClearEngine(engineId: string) {
    const elig = controller.canClearEngine(engineId);
    if (!elig.ok) {
      setBlocked((b) => ({ ...b, [engineId]: elig.reason ?? 'Blocked.' }));
      return;
    }
    if (controller.isLastFireResource(engineId) && confirmClear !== engineId) {
      setConfirmClear(engineId);
      return;
    }
    controller.clearEngine(engineId);
    setConfirmClear(null);
    setBlocked((b) => ({ ...b, [engineId]: '' }));
  }

  const now = clock.elapsedSeconds();
  const arrivedEngines = Object.values(crew.apparatus).filter((a) => a.arrived);

  return (
    <section className={opStyles.panel} aria-label="Crew assignments">
      <h2 className={opStyles.panelTitle}>Crew &amp; task assignments</h2>

      {controller.ronArrived && (
        <div className={opStyles.ron}>
          <span className={opStyles.ronName}>Partner Ron:</span>
          <span>“{controller.ronArrivalLine}”</span>
        </div>
      )}
      {controller.officerPrompts.length > 0 && (
        <p className={styles.officerLine}>Fire Officer: “{controller.officerOfferLine}”</p>
      )}

      <p className={styles.instructionNote}>
        Fire personnel are ready to help, but they will wait for an assignment unless an immediate life-safety
        threat requires action. They are respecting the lead medic’s role and awaiting direction.
      </p>

      {reassignFrom && <p className={styles.officerLine}>Reassigning — pick who takes it over.</p>}

      <div className={styles.roster}>
        {crew.order.map((id) => {
          const r = crew.responders[id];
          const a = r.assignment;
          const isRetr = a?.isRetrieval && a.status !== 'complete';
          const remaining = a?.etaSecond != null ? a.etaSecond - now : undefined;
          const active = !!a && a.status !== 'complete';
          const free = r.onScene && r.status !== 'cleared_from_call' && !active;
          return (
            <div
              key={id}
              className={`${styles.responder} ${selected === id ? styles.selected : ''} ${r.status === 'cleared_from_call' ? styles.cleared : ''}`}
            >
              <div className={styles.responderMain}>
                <div className={styles.responderName}>{r.name}</div>
                {a && (
                  <div className={styles.responderTask}>
                    {isRetr
                      ? `Retrieving ${equipmentLabelForTask(a.taskId)} — `
                      : `${taskDef(a.taskId)?.label ?? a.taskId} — `}
                    {a.status === 'complete'
                      ? 'done'
                      : remaining != null && remaining > 0
                        ? <span className={styles.eta}>{fmt(remaining)}</span>
                        : 'in progress'}
                  </div>
                )}
                {blocked[id] && <div className={styles.blockedReason}>{blocked[id]}</div>}
              </div>

              <span className={`${styles.statusPill} ${styles[`st_${r.status}`]}`}>{STATUS_LABELS[r.status]}</span>

              {r.status !== 'cleared_from_call' && (
                <span className={styles.rowButtons}>
                  {free && (
                    <button
                      type="button"
                      className={styles.smallButton}
                      aria-label={`${reassignFrom ? 'Assign the reassigned task to' : 'Assign'} ${r.name}`}
                      onClick={() => handleResponderClick(r)}
                    >
                      {reassignFrom ? 'Take over' : selected === id ? 'Close' : 'Assign'}
                    </button>
                  )}
                  {active && (
                    <>
                      <button
                        type="button"
                        className={styles.smallButton}
                        aria-label={`Cancel ${r.name}'s task`}
                        onClick={() => controller.cancel(id)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.smallButton}
                        aria-label={`Reassign ${r.name}'s task`}
                        onClick={() => setReassignFrom(id)}
                      >
                        Reassign
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className={styles.palette} aria-label="Task palette">
          <div className={styles.paletteTitle}>Assign a task to {crew.responders[selected]?.name}</div>
          {TASK_GROUPS.map((group) => (
            <div key={group.title}>
              <div className={styles.categoryTitle}>{group.title}</div>
              <div className={styles.taskButtons}>
                {group.tasks.map((t) => (
                  <button key={t.id} type="button" className={styles.taskButton} onClick={() => doAssign(selected, t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {arrivedEngines.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div className={styles.categoryTitle}>Fire apparatus</div>
          {arrivedEngines.map((eng) => (
            <div key={eng.id} className={styles.engineRow}>
              <span>
                {eng.name} — {eng.cleared ? 'Cleared from Call' : 'On Scene'}
              </span>
              {!eng.cleared && (
                <button type="button" className={styles.smallButton} onClick={() => handleClearEngine(eng.id)}>
                  {confirmClear === eng.id ? `Clear ${eng.name} from the call?` : 'Clear Engine from Call'}
                </button>
              )}
              {blocked[eng.id] && <span className={styles.blockedReason}>{blocked[eng.id]}</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.smallButton} onClick={() => setShowResources((v) => !v)}>
          {RON_CREW_LINES.moreHelp}
        </button>
        {showResources && (
          <div className={styles.taskButtons} style={{ marginTop: '0.5rem' }}>
            {RESOURCE_OPTIONS.map((res) => {
              const requested = crew.resourceRequests.includes(res.id);
              return (
                <button
                  key={res.id}
                  type="button"
                  className={styles.taskButton}
                  disabled={requested}
                  onClick={() => controller.requestResource(res.id)}
                >
                  {requested ? `${res.label} ✓` : res.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
