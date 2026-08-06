import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SIMULATOR_CONFIG, type SimulatorConfig } from '@/lib/engine/config';
import type { MissionClock } from '@/lib/engine/missionClock';
import { RON_CREW_LINES, type Apparatus } from '@/lib/opsim/crew';
import {
  createCrewState,
  engineArrives,
  assignTask,
  beginTask,
  completeTask,
  cancelTask,
  reassignTask,
  canClearEngine as canClearEngineFn,
  clearEngine as clearEngineFn,
  isLastFireResource as isLastFn,
  requestResource as requestResourceFn,
  addEquipmentOnScene,
  type CrewState,
  type ClearEligibility,
} from '@/lib/opsim/crewMachine';

/**
 * Owns the crew-resource state and its mission-clock scheduling (engine arrival,
 * the 5s officer prompt, task/retrieval completion) in ONE place, so both the
 * crew panel and Scene Dynamics operate on the same personnel model (§20 — no
 * fake personnel model). Rejections are surfaced, not swallowed.
 */
export interface CrewController {
  readonly crew: CrewState;
  readonly ronArrived: boolean;
  readonly officerPrompts: readonly string[];
  readonly ronArrivalLine: string;
  readonly officerOfferLine: string;
  readonly assign: (responderId: string, taskId: string) => string | null;
  readonly cancel: (responderId: string) => void;
  readonly reassign: (fromId: string, toId: string) => string | null;
  readonly clearEngine: (engineId: string) => void;
  readonly canClearEngine: (engineId: string) => ClearEligibility;
  readonly isLastFireResource: (engineId: string) => boolean;
  readonly requestResource: (resourceId: string) => void;
  /** Delivers the equipment the crew carried in from the truck (§9). */
  readonly deliverEquipment: (equipmentIds: readonly string[]) => void;
}

export function useCrew(
  engines: readonly Apparatus[],
  equipmentOnScene: readonly string[],
  clock: MissionClock,
  arrivalDelaySeconds = 5,
  simConfig: SimulatorConfig = DEFAULT_SIMULATOR_CONFIG,
): CrewController {
  const [crew, setCrew] = useState<CrewState>(() => createCrewState(engines, equipmentOnScene));
  const [ronArrived, setRonArrived] = useState(false);
  const [officerPrompts, setOfficerPrompts] = useState<readonly string[]>([]);
  const scheduledRef = useRef<number[]>([]);

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
        if (a && a.startedAtSecond === startedAt && a.status !== 'complete') return completeTask(s, responderId);
        return s;
      }),
    );
    scheduledRef.current.push(id);
  }

  function assign(responderId: string, taskId: string): string | null {
    const at = clock.elapsedSeconds();
    const result = assignTask(crew, responderId, taskId, at, { config: simConfig });
    if (result.rejected) return result.rejected;
    const started = beginTask(result.state, responderId);
    setCrew(started);
    const a = started.responders[responderId].assignment;
    if (a?.etaSecond != null) scheduleCompletion(responderId, a.startedAtSecond, a.etaSecond);
    return null;
  }

  function reassign(fromId: string, toId: string): string | null {
    const at = clock.elapsedSeconds();
    const result = reassignTask(crew, fromId, toId, at, { config: simConfig });
    if (result.rejected) return result.rejected;
    setCrew(result.state);
    const a = result.state.responders[toId].assignment;
    if (a?.etaSecond != null) scheduleCompletion(toId, a.startedAtSecond, a.etaSecond);
    return null;
  }

  return {
    crew,
    ronArrived,
    officerPrompts,
    ronArrivalLine: RON_CREW_LINES.engineArrival,
    officerOfferLine: RON_CREW_LINES.officerOffer,
    assign,
    cancel: (responderId) => setCrew(cancelTask(crew, responderId)),
    reassign,
    clearEngine: (engineId) => setCrew(clearEngineFn(crew, engineId)),
    canClearEngine: (engineId) => canClearEngineFn(crew, engineId),
    isLastFireResource: (engineId) => isLastFn(crew, engineId),
    requestResource: (resourceId) => setCrew(requestResourceFn(crew, resourceId)),
    deliverEquipment: (equipmentIds) => setCrew((s) => addEquipmentOnScene(s, equipmentIds)),
  };
}
