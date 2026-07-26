'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
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
  type Apparatus,
} from '@/lib/opsim/crew';
import {
  createCrewState,
  engineArrives,
  assignTask,
  beginTask,
  completeTask,
  cancelTask,
  reassignTask,
  canClearEngine,
  clearEngine,
  isLastFireResource,
  requestResource,
  type CrewState,
  type ResponderRuntime,
} from '@/lib/opsim/crewMachine';
import opStyles from './OperationalSim.module.css';
import styles from './CrewOps.module.css';

interface CrewOpsProps {
  readonly engines: readonly Apparatus[];
  readonly equipmentOnScene: readonly string[];
  readonly clock: MissionClock;
  readonly arrivalDelaySeconds?: number;
  readonly simConfig?: SimulatorConfig;
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

/**
 * Crew-resource management (§10–§14): roster, task assignment, 45s equipment
 * retrieval, Clear Engine from Call, and resource requests. Engine arrival and
 * the 5s fire-officer prompt, plus task/retrieval completion, are scheduled on
 * the shared mission clock — no ad-hoc component timers.
 */
export function CrewOps({
  engines,
  equipmentOnScene,
  clock,
  arrivalDelaySeconds = 5,
  simConfig = DEFAULT_SIMULATOR_CONFIG,
}: CrewOpsProps) {
  const [crew, setCrew] = useState<CrewState>(() => createCrewState(engines, equipmentOnScene));
  const [selected, setSelected] = useState<string | null>(null);
  const [reassignFrom, setReassignFrom] = useState<string | null>(null);
  const [ronArrived, setRonArrived] = useState(false);
  const [officerPrompts, setOfficerPrompts] = useState<readonly string[]>([]);
  const [showResources, setShowResources] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const scheduledRef = useRef<number[]>([]);

  // Schedule each engine's arrival, and 5s after each arrival the officer prompt.
  useEffect(() => {
    for (const eng of engines) {
      const arrId = clock.after(arrivalDelaySeconds, () => {
        setCrew((s) => engineArrives(s, eng.id, clock.elapsedSeconds()));
        setRonArrived(true);
        const offId = clock.after(simConfig.timing.fireOfficerQuestionDelaySeconds, () =>
          setOfficerPrompts((prev) => (prev.includes(eng.id) ? prev : [...prev, eng.id])),
        );
        scheduledRef.current.push(offId);
      });
      scheduledRef.current.push(arrId);
    }
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [engines, clock, arrivalDelaySeconds, simConfig]);

  function scheduleCompletion(responderId: string, startedAt: number, etaSecond: number) {
    const id = clock.after(etaSecond - clock.elapsedSeconds(), () =>
      setCrew((s) => {
        const a = s.responders[responderId]?.assignment;
        // Only complete if this exact assignment is still active (guards cancel/reassign).
        if (a && a.startedAtSecond === startedAt && a.status !== 'complete') return completeTask(s, responderId);
        return s;
      }),
    );
    scheduledRef.current.push(id);
  }

  function doAssign(responderId: string, taskId: string) {
    const at = clock.elapsedSeconds();
    const result = assignTask(crew, responderId, taskId, at, { config: simConfig });
    if (result.rejected) {
      setBlocked((b) => ({ ...b, [responderId]: rejectionMessage(result.rejected!, taskId) }));
      return;
    }
    const started = beginTask(result.state, responderId);
    setCrew(started);
    const a = started.responders[responderId].assignment;
    if (a?.etaSecond != null) scheduleCompletion(responderId, a.startedAtSecond, a.etaSecond);
    setSelected(null);
    setBlocked((b) => ({ ...b, [responderId]: '' }));
  }

  function handleResponderClick(r: ResponderRuntime) {
    if (reassignFrom && reassignFrom !== r.id) {
      const at = clock.elapsedSeconds();
      const result = reassignTask(crew, reassignFrom, r.id, at, { config: simConfig });
      if (!result.rejected) {
        setCrew(result.state);
        const a = result.state.responders[r.id].assignment;
        if (a?.etaSecond != null) scheduleCompletion(r.id, a.startedAtSecond, a.etaSecond);
      }
      setReassignFrom(null);
      return;
    }
    setSelected((cur) => (cur === r.id ? null : r.id));
  }

  function handleClearEngine(engineId: string) {
    const elig = canClearEngine(crew, engineId);
    if (!elig.ok) {
      setBlocked((b) => ({ ...b, [engineId]: elig.reason ?? 'Blocked.' }));
      return;
    }
    if (isLastFireResource(crew, engineId) && confirmClear !== engineId) {
      setConfirmClear(engineId);
      return;
    }
    setCrew(clearEngine(crew, engineId));
    setConfirmClear(null);
    setBlocked((b) => ({ ...b, [engineId]: '' }));
  }

  const now = clock.elapsedSeconds();
  const arrivedEngines = Object.values(crew.apparatus).filter((a) => a.arrived);

  return (
    <section className={opStyles.panel} aria-label="Crew assignments">
      <h2 className={opStyles.panelTitle}>Crew &amp; task assignments</h2>

      {ronArrived && (
        <div className={opStyles.ron}>
          <span className={opStyles.ronName}>Partner Ron:</span>
          <span>“{RON_CREW_LINES.engineArrival}”</span>
        </div>
      )}
      {officerPrompts.length > 0 && (
        <p className={styles.officerLine}>Fire Officer: “{RON_CREW_LINES.officerOffer}”</p>
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

              <span className={`${styles.statusPill} ${styles[`st_${r.status}`]}`}>
                {STATUS_LABELS[r.status]}
              </span>

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
                        onClick={() => setCrew(cancelTask(crew, id))}
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
                  onClick={() => setCrew(requestResource(crew, res.id))}
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
