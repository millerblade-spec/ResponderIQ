import { describe, it, expect } from 'vitest';
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
  transferRoadway,
  isLastFireResource,
  requestResource,
  freeResponders,
} from './crewMachine';
import { fireResponseFor, ENGINE_ARRIVAL_AUDIO } from './crew';

const emsEngines = () => fireResponseFor('ems');

/** Bring an engine on scene and return the officer id. */
function withEngine(equipmentOnScene: string[] = []) {
  const engines = emsEngines();
  let state = createCrewState(engines, equipmentOnScene);
  state = engineArrives(state, engines[0].id, 100);
  return { state, engineId: engines[0].id, officerId: `${engines[0].id}_officer`, ff1: `${engines[0].id}_ff1` };
}

describe('fire response (§10)', () => {
  it('sends one engine to an EMS call', () => {
    expect(fireResponseFor('ems')).toHaveLength(1);
  });

  it('sends two engines to a two-vehicle accident — first blocks the roadway, second supports', () => {
    const engines = fireResponseFor('mvc_two_vehicle');
    expect(engines).toHaveLength(2);
    expect(engines[0].role).toBe('roadway_block');
    expect(engines[1].role).toBe('support');
  });
});

describe('engine arrival (§11)', () => {
  it('brings the crew on scene as Awaiting Assignment and fires the arrival audio sequence', () => {
    const { state, officerId } = withEngine();
    expect(state.responders[officerId].status).toBe('awaiting_assignment');
    expect(state.audioEvents.map((a) => a.event)).toEqual(ENGINE_ARRIVAL_AUDIO);
  });

  it('is idempotent — a second arrival adds nothing', () => {
    const engines = emsEngines();
    let s = engineArrives(createCrewState(engines, []), engines[0].id, 100);
    const before = state_snapshot(s);
    s = engineArrives(s, engines[0].id, 120);
    expect(state_snapshot(s)).toEqual(before);
  });
});

function state_snapshot(s: ReturnType<typeof createCrewState>) {
  return { count: Object.keys(s.responders).length, audio: s.audioEvents.length };
}

describe('personnel & task assignment (§12)', () => {
  it('everyone starts Awaiting Assignment and stays visible', () => {
    const { state, officerId, ff1 } = withEngine();
    expect(state.responders['partner_ron'].status).toBe('awaiting_assignment');
    expect(state.responders[officerId].status).toBe('awaiting_assignment');
    expect(state.responders[ff1].status).toBe('awaiting_assignment');
    expect(freeResponders(state).length).toBeGreaterThanOrEqual(6);
  });

  it('assign → Assigned, begin → Task in Progress, complete → Task Complete', () => {
    let { state } = withEngine();
    state = assignTask(state, 'partner_ron', 'obtain_vitals', 120).state;
    expect(state.responders['partner_ron'].status).toBe('assigned');
    state = beginTask(state, 'partner_ron');
    expect(state.responders['partner_ron'].status).toBe('task_in_progress');
    state = completeTask(state, 'partner_ron');
    expect(state.responders['partner_ron'].status).toBe('task_complete');
  });

  it('allows only one active task per responder', () => {
    let { state } = withEngine();
    state = assignTask(state, 'partner_ron', 'obtain_vitals', 120).state;
    const second = assignTask(state, 'partner_ron', 'apply_oxygen', 121);
    expect(second.rejected).toBe('busy');
    expect(second.state.responders['partner_ron'].assignment?.taskId).toBe('obtain_vitals');
  });

  it('can assign Partner Ron and the lead medic (themselves)', () => {
    let { state } = withEngine();
    state = assignTask(state, 'partner_ron', 'manage_family', 120).state;
    state = assignTask(state, 'lead_medic', 'interview_patient', 120).state;
    expect(state.responders['partner_ron'].assignment?.taskId).toBe('manage_family');
    expect(state.responders['lead_medic'].assignment?.taskId).toBe('interview_patient');
  });

  it('tasks can be canceled (responder returns to Awaiting Assignment)', () => {
    let { state } = withEngine();
    state = assignTask(state, 'partner_ron', 'obtain_vitals', 120).state;
    state = cancelTask(state, 'partner_ron');
    expect(state.responders['partner_ron'].status).toBe('awaiting_assignment');
    expect(state.responders['partner_ron'].assignment).toBeUndefined();
  });

  it('tasks can be reassigned to a free responder', () => {
    const w = withEngine(); let state = w.state; const ff1 = w.ff1;
    state = assignTask(state, 'partner_ron', 'obtain_vitals', 120).state;
    const r = reassignTask(state, 'partner_ron', ff1, 121);
    expect(r.rejected).toBeUndefined();
    expect(r.state.responders['partner_ron'].status).toBe('awaiting_assignment');
    expect(r.state.responders[ff1].assignment?.taskId).toBe('obtain_vitals');
  });

  it('the fire officer accepts a normal assignment but refuses an unsafe one (§13)', () => {
    const { state, officerId } = withEngine();
    const ok = assignTask(state, officerId, 'coordinate_police', 120);
    expect(ok.rejected).toBeUndefined();
    expect(ok.state.officerResponses.at(-1)?.kind).toBe('accept');

    const unsafe = assignTask(state, officerId, 'support_extrication', 120, { hazardControlled: false });
    expect(unsafe.rejected).toBe('safety');
    expect(unsafe.state.officerResponses.at(-1)?.kind).toBe('safety');
  });

  it('cleared personnel cannot be assigned', () => {
    const w = withEngine(); let state = w.state; const { engineId, officerId } = w;
    state = clearEngine(state, engineId);
    const r = assignTask(state, officerId, 'coordinate_police', 200);
    expect(r.rejected).toBe('cleared');
  });
});

describe('equipment retrieval (§9, §12)', () => {
  it('selected equipment is immediately available — no retrieval needed', () => {
    const { state, ff1 } = withEngine(['cardiac_monitor']);
    const r = assignTask(state, ff1, 'bring_cardiac_monitor', 120);
    expect(r.rejected).toBe('already_on_scene');
  });

  it('unselected equipment needs a responder and a 45-second retrieval that keeps them unavailable', () => {
    const w = withEngine([]); let state = w.state; const ff1 = w.ff1; // nothing on scene
    const r = assignTask(state, ff1, 'bring_portable_suction', 120);
    expect(r.rejected).toBeUndefined();
    state = r.state;
    const a = state.responders[ff1].assignment!;
    expect(a.isRetrieval).toBe(true);
    expect(a.etaSecond).toBe(120 + 45);
    // Busy: can't take another task.
    expect(assignTask(state, ff1, 'apply_oxygen', 121).rejected).toBe('busy');
    // Equipment not yet on scene.
    expect(state.equipmentOnScene).not.toContain('portable_suction');
  });

  it('equipment only becomes available once the retrieval completes', () => {
    const w = withEngine([]); let state = w.state; const ff1 = w.ff1;
    state = assignTask(state, ff1, 'bring_portable_suction', 120).state;
    state = beginTask(state, ff1);
    expect(state.equipmentOnScene).not.toContain('portable_suction');
    state = completeTask(state, ff1);
    expect(state.equipmentOnScene).toContain('portable_suction');
  });

  it('a canceled retrieval does NOT deliver equipment; the responder frees up', () => {
    const w = withEngine([]); let state = w.state; const ff1 = w.ff1;
    state = assignTask(state, ff1, 'bring_portable_suction', 120).state;
    state = cancelTask(state, ff1);
    expect(state.equipmentOnScene).not.toContain('portable_suction');
    expect(state.responders[ff1].status).toBe('awaiting_assignment');
  });

  it('retrieval can be reassigned to another free responder', () => {
    const w = withEngine([]); let state = w.state; const { ff1, engineId } = w;
    const ff2 = `${engineId}_ff2`;
    state = assignTask(state, ff1, 'bring_portable_suction', 120).state;
    const r = reassignTask(state, ff1, ff2, 121);
    expect(r.state.responders[ff2].assignment?.isRetrieval).toBe(true);
    expect(r.state.responders[ff1].status).toBe('awaiting_assignment');
  });
});

describe('Clear Engine from Call (§14)', () => {
  it('is blocked while a member has an active task, and explains why', () => {
    const w = withEngine([]); let state = w.state; const { engineId, ff1 } = w;
    state = assignTask(state, ff1, 'obtain_vitals', 120).state;
    const c = canClearEngine(state, engineId);
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/cannot be cleared/i);
    expect(clearEngine(state, engineId).apparatus[engineId].cleared).toBe(false);
  });

  it('is blocked while a member is retrieving equipment', () => {
    const w = withEngine([]); let state = w.state; const { engineId, ff1 } = w;
    state = assignTask(state, ff1, 'bring_portable_suction', 120).state;
    expect(canClearEngine(state, engineId).reason).toMatch(/retrieving/i);
  });

  it('a roadway-block engine cannot be cleared until its roadway role is transferred', () => {
    const engines = fireResponseFor('mvc_two_vehicle');
    let state = createCrewState(engines, []);
    state = engineArrives(state, engines[0].id, 100);
    expect(canClearEngine(state, engines[0].id).reason).toMatch(/blocking the roadway/i);
    state = transferRoadway(state, engines[0].id);
    expect(canClearEngine(state, engines[0].id).ok).toBe(true);
  });

  it('can be cleared once obligations end; members become Cleared from Call and leave', () => {
    const w = withEngine([]); let state = w.state; const { engineId, ff1, officerId } = w;
    state = assignTask(state, ff1, 'obtain_vitals', 120).state;
    state = beginTask(state, ff1);
    state = completeTask(state, ff1);
    state = clearEngine(state, engineId);
    expect(state.apparatus[engineId].cleared).toBe(true);
    expect(state.responders[officerId].status).toBe('cleared_from_call');
    expect(state.responders[ff1].onScene).toBe(false);
  });

  it('knows when clearing an engine removes the last fire resource (confirm-first)', () => {
    const { state, engineId } = withEngine([]);
    expect(isLastFireResource(state, engineId)).toBe(true);
  });
});

describe('resource escalation (§ resource requests)', () => {
  it('records requested resources without duplicates and never auto-requests', () => {
    let { state } = withEngine();
    expect(state.resourceRequests).toEqual([]); // nothing requested automatically
    state = requestResource(state, 'heavy_rescue');
    state = requestResource(state, 'heavy_rescue');
    expect(state.resourceRequests).toEqual(['heavy_rescue']);
  });
});
