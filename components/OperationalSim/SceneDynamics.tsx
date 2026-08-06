'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { MissionClock } from '@/lib/engine/missionClock';
import {
  DYNAMIC_STATUS_LABELS,
  distractionType,
  type DifficultyName,
  type DistractionAction,
} from '@/lib/opsim/dynamics';
import { taskDef } from '@/lib/opsim/crew';
import {
  createDynamicsState,
  appearDistraction,
  escalate,
  improve,
  resolveDirect,
  beginManaging,
  resolveManagement,
  cancelManaging,
  acknowledge,
  currentConsequence,
  type DynamicsState,
} from '@/lib/opsim/dynamicsMachine';
import type { ScenarioDistraction } from '@/lib/scenarios/bls-01.dispatch';
import { syncDistractionAudio } from '@/lib/audio/dynamicsAudio';
import { useAudioOptional } from '@/components/Audio/AudioProvider';
import type { CrewController } from './useCrew';
import opStyles from './OperationalSim.module.css';
import styles from './SceneDynamics.module.css';

interface SceneDynamicsProps {
  readonly controller: CrewController;
  readonly clock: MissionClock;
  readonly difficulty: DifficultyName;
  readonly distractions: readonly ScenarioDistraction[];
  /**
   * Distractions only start once this is true (patient contact) — the TV and
   * the anxious family are inside the apartment, not out at the truck (fix #9).
   */
  readonly active?: boolean;
  readonly simConfig?: SimulatorConfig;
  /** Reports the latest dynamics state up for run capture (§ Step 10). */
  readonly onStateChange?: (state: DynamicsState) => void;
}

/**
 * Scene Dynamics panel (§20). Distractions appear, escalate on the shared
 * mission clock (first at 10s, then every 5s — paused while being managed),
 * and resolve when handled. Management assigns REAL crew (via the shared
 * controller), so one responder can't manage two issues.
 */
export function SceneDynamics({
  controller,
  clock,
  difficulty,
  distractions,
  active = true,
  simConfig = DEFAULT_SIMULATOR_CONFIG,
  onStateChange,
}: SceneDynamicsProps) {
  const [dynamics, setDynamics] = useState<DynamicsState>(() => createDynamicsState(difficulty));
  const [pick, setPick] = useState<{ issueId: string; actionId: string; crewTaskId: string } | null>(null);
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const scheduledRef = useRef<number[]>([]);
  const resolutionRef = useRef<Record<string, number>>({});
  const startedRef = useRef(false);
  const audioController = useAudioOptional()?.controller;

  // Appearance + escalation scheduling, starting only once `active` (patient
  // contact) and scheduled exactly once. escalate() no-ops while
  // managed/resolved or at the max stage, so a single recurring timer
  // naturally pauses/resumes.
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    for (const d of distractions) {
      const appearId = clock.after(d.appearAtSecond, () => {
        setDynamics((prev) => appearDistraction(prev, d.id, d.type, clock.elapsedSeconds()));
        const escId = clock.everySeconds(
          simConfig.timing.furtherDistractionEscalationSeconds,
          () => setDynamics((prev) => escalate(prev, d.id)),
          simConfig.timing.firstDistractionEscalationSeconds,
        );
        scheduledRef.current.push(escId);
      });
      scheduledRef.current.push(appearId);
    }
    const scheduled = scheduledRef.current;
    return () => scheduled.forEach((id) => clock.cancel(id));
  }, [active, distractions, clock, simConfig, difficulty]);

  useEffect(() => {
    onStateChange?.(dynamics);
    // Scene Dynamics audio follows the existing stages (§20/§11) — louder as it
    // escalates, stopped when managed or resolved.
    if (audioController) {
      for (const id of dynamics.order) {
        const issue = dynamics.issues[id];
        const maxStageIndex = Math.max(0, (distractionType(issue.type)?.stages.length ?? 1) - 1);
        syncDistractionAudio(audioController, { type: issue.type, stageIndex: issue.stageIndex, resolved: issue.resolved, managed: issue.managed }, maxStageIndex);
      }
    }
  }, [dynamics, onStateChange, audioController]);

  const now = clock.elapsedSeconds();

  function applyAction(issueId: string, action: DistractionAction) {
    if (action.kind === 'assign' && action.crewTaskId) {
      setPick({ issueId, actionId: action.id, crewTaskId: action.crewTaskId });
      return;
    }
    if (action.kind === 'self_resolve') setDynamics((p) => resolveDirect(p, issueId, action.id, now));
    else if (action.kind === 'self_improve') setDynamics((p) => improve(p, issueId, action.id, now));
    else if (action.kind === 'ignore') setDynamics((p) => acknowledge(p, issueId, action.id, now));
    else if (action.kind === 'request_police') {
      setDynamics((p) => beginManaging(p, issueId, 'police', action.id, now));
      scheduleResolution(issueId, 15);
    }
  }

  function scheduleResolution(issueId: string, delaySeconds: number) {
    const id = clock.after(delaySeconds, () => setDynamics((p) => resolveManagement(p, issueId)));
    resolutionRef.current[issueId] = id;
    scheduledRef.current.push(id);
  }

  function pickResponder(responderId: string) {
    if (!pick) return;
    const rejected = controller.assign(responderId, pick.crewTaskId);
    if (rejected) {
      setBlocked((b) => ({ ...b, [pick.issueId]: 'That responder is already busy — pick someone else.' }));
      return;
    }
    setDynamics((p) => beginManaging(p, pick.issueId, responderId, pick.actionId, now));
    const duration = taskDef(pick.crewTaskId)?.durationSeconds ?? 60;
    scheduleResolution(pick.issueId, duration);
    setBlocked((b) => ({ ...b, [pick.issueId]: '' }));
    setPick(null);
  }

  function stopManaging(issueId: string, responderId?: string) {
    if (responderId && responderId !== 'police') controller.cancel(responderId);
    const rid = resolutionRef.current[issueId];
    if (rid != null) clock.cancel(rid);
    setDynamics((p) => cancelManaging(p, issueId));
  }

  const freeResponders = controller.crew.order
    .map((id) => controller.crew.responders[id])
    .filter((r) => r.onScene && r.status !== 'cleared_from_call' && (!r.assignment || r.assignment.status === 'complete'));

  const fireAwaiting = controller.crew.order
    .map((id) => controller.crew.responders[id])
    .filter((r) => (r.role === 'firefighter' || r.role === 'fire_officer') && r.status === 'awaiting_assignment' && r.onScene);

  const activeIssues = dynamics.order.map((id) => dynamics.issues[id]);
  const anyActive = activeIssues.some((i) => !i.resolved);

  return (
    <section className={`${opStyles.panel} ${styles.panel}`} aria-label="Scene Dynamics">
      <h2 className={opStyles.panelTitle}>Scene Dynamics</h2>

      {fireAwaiting.length > 0 && (
        <div className={styles.fireAwaiting}>
          {fireAwaiting.length} fire personnel awaiting assignment — ready to help when you give direction.
        </div>
      )}

      {!anyActive && activeIssues.length === 0 && (
        <p className={styles.empty}>No active scene distractions right now.</p>
      )}

      {activeIssues.map((issue) => {
        const type = distractionType(issue.type)!;
        const stage = type.stages[issue.stageIndex];
        const consequence = currentConsequence(dynamics, issue.id);
        const nextEscalationAt = issue.startedAtSecond + simConfig.timing.firstDistractionEscalationSeconds + issue.stageIndex * simConfig.timing.furtherDistractionEscalationSeconds;
        const remaining = nextEscalationAt - now;
        const escalating = issue.status === 'developing' || issue.status === 'escalating';
        const assigned = issue.assignedResponderId ? controller.crew.responders[issue.assignedResponderId]?.name ?? issue.assignedResponderId : undefined;
        const statusClass = issue.resolved
          ? styles.resolvedChip
          : issue.status === 'immediate_safety_threat'
            ? styles.threat
            : issue.status === 'being_managed'
              ? styles.managed
              : '';
        return (
          <div key={issue.id} className={`${styles.issue} ${styles[`sev_${stage.severity}`] ?? ''} ${issue.resolved ? styles.resolved : ''}`}>
            <div className={styles.issueHeader}>
              <span className={styles.issueTitle}>{type.label}</span>
              <span className={`${styles.statusChip} ${statusClass}`}>{DYNAMIC_STATUS_LABELS[issue.status]}</span>
            </div>
            <div className={styles.stageLine}>{stage.description}</div>
            <div className={styles.meta}>
              <span>Stage {issue.stageIndex + 1} of {type.stages.length}</span>
              {escalating && remaining > 0 && <span className={styles.countdown}>Escalates in {remaining}s</span>}
              {assigned && <span>Being handled by {assigned}</span>}
            </div>
            {consequence && !issue.resolved && <div className={styles.consequence}>{consequence}</div>}

            {!issue.resolved && (
              <div className={styles.actions}>
                {type.actions.map((action) => (
                  <button key={action.id} type="button" className={styles.actionButton} onClick={() => applyAction(issue.id, action)}>
                    {action.label}
                  </button>
                ))}
                {issue.status === 'being_managed' && (
                  <button type="button" className={styles.actionButton} onClick={() => stopManaging(issue.id, issue.assignedResponderId)}>
                    Stop managing
                  </button>
                )}
              </div>
            )}

            {pick?.issueId === issue.id && (
              <div className={styles.picker} aria-label="Choose who manages this">
                <div className={styles.pickerTitle}>Who should take this?</div>
                <div className={styles.actions}>
                  {freeResponders.map((r) => (
                    <button key={r.id} type="button" className={styles.actionButton} onClick={() => pickResponder(r.id)}>
                      {r.name}
                    </button>
                  ))}
                  <button type="button" className={styles.actionButton} onClick={() => setPick(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {blocked[issue.id] && <div className={styles.blocked}>{blocked[issue.id]}</div>}
          </div>
        );
      })}
    </section>
  );
}
