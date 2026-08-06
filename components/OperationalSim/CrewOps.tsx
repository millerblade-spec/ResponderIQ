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
  type TaskCategory,
  type TaskDef,
} from '@/lib/opsim/crew';
import type { CrewController } from './useCrew';
import type { ResponderRuntime } from '@/lib/opsim/crewMachine';
import opStyles from './OperationalSim.module.css';
import styles from './CrewOps.module.css';

interface CrewOpsProps {
  readonly controller: CrewController;
  readonly clock: MissionClock;
}

const CATEGORIES: { id: TaskCategory; label: string; tasks: readonly TaskDef[] }[] = [
  { id: 'patient_care', label: 'Patient care', tasks: PATIENT_CARE_TASKS },
  { id: 'equipment', label: 'Equipment', tasks: EQUIPMENT_TASKS },
  { id: 'scene_ops', label: 'Scene operations', tasks: SCENE_OPS_TASKS },
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

/** Human-readable requirements for the drawer review step (read from the task def). */
function taskRequirements(t: TaskDef): string[] {
  const reqs: string[] = [];
  if (t.durationSeconds != null) reqs.push(`Estimated ${fmt(t.durationSeconds)} to complete`);
  if (t.equipmentId) reqs.push('Equipment retrieval — 45s if it is still on Medic 3');
  if (t.revealsClinical) reqs.push('Reveals clinical findings (needs patient contact)');
  if (t.safetyHazard) reqs.push('Fire crew will refuse while the hazard is uncontrolled');
  if (t.obligation) reqs.push('Creates a safety/roadway obligation that blocks clearing the engine');
  if (reqs.length === 0) reqs.push('No special requirements.');
  return reqs;
}

/**
 * Crew-resource management panel (§10–§14). Presentational: it reads and mutates
 * the shared crew via the CrewController, so Scene Dynamics and this panel act on
 * the same personnel. The default view is a roster; assigning a task opens a
 * focused drawer (category → task → review → confirm) rather than a wall of
 * buttons — every task still comes from the existing task data and dispatches the
 * same crew-machine action.
 */
export function CrewOps({ controller, clock }: CrewOpsProps) {
  const { crew } = controller;
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const [category, setCategory] = useState<TaskCategory | null>(null);
  const [task, setTask] = useState<TaskDef | null>(null);
  const [reassignFrom, setReassignFrom] = useState<string | null>(null);
  const [showResources, setShowResources] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});

  function openDrawer(responderId: string) {
    setDrawerFor(responderId);
    setCategory(null);
    setTask(null);
  }
  function closeDrawer() {
    setDrawerFor(null);
    setCategory(null);
    setTask(null);
  }

  function confirmAssign() {
    if (!drawerFor || !task) return;
    const rejected = controller.assign(drawerFor, task.id);
    if (rejected) {
      setBlocked((b) => ({ ...b, [drawerFor]: rejectionMessage(rejected, task.id) }));
      closeDrawer();
      return;
    }
    setBlocked((b) => ({ ...b, [drawerFor]: '' }));
    closeDrawer();
  }

  function handleResponderClick(r: ResponderRuntime) {
    if (reassignFrom && reassignFrom !== r.id) {
      controller.reassign(reassignFrom, r.id);
      setReassignFrom(null);
      return;
    }
    openDrawer(r.id);
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
  const drawerName = drawerFor ? crew.responders[drawerFor]?.name : '';

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

      <div className={styles.roster} role="table" aria-label="Crew roster">
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
              role="row"
              className={`${styles.responder} ${drawerFor === id ? styles.selected : ''} ${r.status === 'cleared_from_call' ? styles.cleared : ''}`}
            >
              <div className={styles.responderMain}>
                <div className={styles.responderName}>{r.name}</div>
                {a && (
                  <div className={styles.responderTask}>
                    {isRetr
                      ? `Retrieving ${equipmentLabelForTask(a.taskId)} — `
                      : `${taskDef(a.taskId)?.label ?? a.taskId} — `}
                    {a.status === 'complete' ? (
                      'done'
                    ) : remaining != null && remaining > 0 ? (
                      <span className={styles.eta}>{fmt(remaining)}</span>
                    ) : (
                      'in progress'
                    )}
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
                      {reassignFrom ? 'Take over' : 'Assign'}
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

      {/* ---- Assignment drawer ---- */}
      {drawerFor && (
        <div className={opStyles.overlay} onClick={closeDrawer}>
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={`Assign a task to ${drawerName}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>Assign — {drawerName}</div>
              <button type="button" className={styles.smallButton} aria-label="Close" onClick={closeDrawer}>
                ✕
              </button>
            </div>

            <ol className={styles.steps} aria-hidden="true">
              <li className={!category ? styles.stepActive : styles.stepDone}>1 Category</li>
              <li className={category && !task ? styles.stepActive : task ? styles.stepDone : ''}>2 Task</li>
              <li className={task ? styles.stepActive : ''}>3 Review</li>
            </ol>

            {!category && (
              <div className={styles.taskButtons}>
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" className={styles.taskButton} onClick={() => setCategory(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {category && !task && (
              <>
                <button type="button" className={styles.linkButton} onClick={() => setCategory(null)}>
                  ← Back to categories
                </button>
                <div className={styles.taskButtons}>
                  {CATEGORIES.find((c) => c.id === category)?.tasks.map((t) => (
                    <button key={t.id} type="button" className={styles.taskButton} onClick={() => setTask(t)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {task && (
              <>
                <button type="button" className={styles.linkButton} onClick={() => setTask(null)}>
                  ← Back to tasks
                </button>
                <div className={styles.review}>
                  <div className={styles.reviewTask}>{task.label}</div>
                  <ul className={styles.reviewReqs}>
                    {taskRequirements(task).map((req) => (
                      <li key={req}>{req}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.drawerFooter}>
                  <button type="button" className={styles.smallButton} onClick={closeDrawer}>
                    Cancel
                  </button>
                  <button type="button" className={styles.confirmButton} onClick={confirmAssign}>
                    Confirm assignment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
