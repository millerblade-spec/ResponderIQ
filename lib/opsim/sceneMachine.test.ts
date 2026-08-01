import { describe, it, expect } from 'vitest';
import {
  createSceneSafetyState,
  markWindshieldReviewed,
  declareSafeToEnter,
  stageForSafety,
  policeArrive,
  policeSecureScene,
  showSceneLightPrompt,
  chooseSceneLight,
  showBallisticPrompt,
  chooseBallistic,
  donWeatherGear,
  exitUnit,
  toggleSceneEquipment,
  confirmSceneEquipment,
  reachPatientFloor,
  noteFloorLighting,
  noteDoorOpen,
  establishPatientContact,
  clinicalUnlocked,
  isClearedToEnter,
  preContactStatus,
} from './sceneMachine';
import { bls01Scene, bls01SecurityScene } from '@/lib/scenarios/bls-01.dispatch';

const normal = () => createSceneSafetyState(bls01Scene);
const security = () => createSceneSafetyState(bls01SecurityScene);

describe('scene safety — windshield & clinical lock (§15, §19)', () => {
  it('starts at the windshield with clinical actions locked and ABCs Unknown', () => {
    const s = normal();
    expect(s.stage).toBe('windshield');
    expect(clinicalUnlocked(s)).toBe(false);
    const status = preContactStatus(s);
    expect(status['Patient contact']).toBe('Not established');
    expect(status.Consciousness).toBe('Unknown');
    expect(status.Airway).toBe('Unknown');
    expect(status.Breathing).toBe('Unknown');
    expect(status.Circulation).toBe('Unknown');
  });

  it('unlocks clinical only after windshield + safe + equipment + exit + floor + contact', () => {
    let s = normal();
    s = declareSafeToEnter(s, bls01Scene);
    expect(s.windshieldReviewed).toBe(true);
    expect(clinicalUnlocked(s)).toBe(false); // haven't stepped out yet
    s = exitUnit(s);
    expect(s.stage).toBe('equipment'); // "what do you want to bring in?" (§9)
    expect(s.equipment.promptShown).toBe(true);
    expect(clinicalUnlocked(s)).toBe(false);
    s = confirmSceneEquipment(s);
    expect(s.stage).toBe('exited');
    expect(clinicalUnlocked(s)).toBe(false); // approaching, not there yet
    s = reachPatientFloor(s);
    expect(s.stage).toBe('floor_arrival'); // the pre-entry read (fix #10)
    expect(clinicalUnlocked(s)).toBe(false);
    s = establishPatientContact(s);
    expect(clinicalUnlocked(s)).toBe(true);
    expect(preContactStatus(s)['Patient contact']).toBe('Established');
  });

  it('cannot exit the unit or make contact before it is safe to enter', () => {
    let s = normal();
    expect(exitUnit(s).stage).toBe('windshield'); // no-op while not safe
    s = markWindshieldReviewed(s);
    expect(establishPatientContact(s).stage).toBe('windshield'); // no-op, never got upstairs
  });
});

describe('scene safety — equipment on exit (§9, fix #6)', () => {
  const atEquipment = () => exitUnit(declareSafeToEnter(normal(), bls01Scene));

  it('toggles selections while the prompt is open', () => {
    let s = atEquipment();
    s = toggleSceneEquipment(s, 'stair_chair');
    s = toggleSceneEquipment(s, 'als_bag');
    expect(s.equipment.selected).toEqual(['stair_chair', 'als_bag']);
    s = toggleSceneEquipment(s, 'als_bag');
    expect(s.equipment.selected).toEqual(['stair_chair']);
  });

  it('confirming locks the selection and starts the approach', () => {
    let s = toggleSceneEquipment(atEquipment(), 'stair_chair');
    s = confirmSceneEquipment(s);
    expect(s.equipment.confirmed).toBe(true);
    expect(s.stage).toBe('exited');
    // No changes after confirm.
    expect(toggleSceneEquipment(s, 'als_bag')).toBe(s);
  });

  it('cannot toggle equipment outside the equipment stage', () => {
    const s = normal();
    expect(toggleSceneEquipment(s, 'als_bag')).toBe(s);
  });
});

describe('scene safety — floor arrival (fixes #9, #10)', () => {
  const atFloor = () =>
    reachPatientFloor(confirmSceneEquipment(exitUnit(declareSafeToEnter(normal(), bls01Scene))));

  it('records the lighting and open-door observations', () => {
    let s = atFloor();
    expect(s.floor.lightingNoted).toBe(false);
    expect(s.floor.doorNoted).toBe(false);
    s = noteFloorLighting(s);
    s = noteDoorOpen(s);
    expect(s.floor.lightingNoted).toBe(true);
    expect(s.floor.doorNoted).toBe(true);
  });

  it('observations are optional — contact can be made without them (they just go unrecorded)', () => {
    const s = establishPatientContact(atFloor());
    expect(s.stage).toBe('patient_contact');
    expect(s.floor.lightingNoted).toBe(false);
  });

  it('floor observations are no-ops off the floor-arrival stage', () => {
    const s = normal();
    expect(noteFloorLighting(s)).toBe(s);
    expect(noteDoorOpen(s)).toBe(s);
  });
});

describe('scene safety — staging & police clearance (§16)', () => {
  it('a dispatch staging order starts the crew staged and blocks self-clearing', () => {
    const s = security();
    expect(s.stage).toBe('staging');
    expect(s.staging.staged).toBe(true);
    // Cannot declare safe on your own under a staging order.
    expect(declareSafeToEnter(s, bls01SecurityScene).stage).toBe('staging');
  });

  it('runs police arrival then securement, yielding clearance to enter', () => {
    let s = security();
    expect(isClearedToEnter(s)).toBe(false);
    s = policeArrive(s);
    expect(s.staging.policeArrived).toBe(true);
    expect(isClearedToEnter(s)).toBe(false); // arrived, not yet secured
    s = policeSecureScene(s);
    expect(s.staging.sceneSecured).toBe(true);
    expect(s.staging.clearedToEnter).toBe(true);
    expect(s.stage).toBe('safe_to_enter');
    expect(isClearedToEnter(s)).toBe(true);
  });

  it('police cannot secure before arriving', () => {
    const s = security();
    expect(policeSecureScene(s).staging.sceneSecured).toBe(false);
  });

  it('a learner can stage on their own read of an unsafe scene', () => {
    const s = stageForSafety(normal());
    expect(s.stage).toBe('staging');
    expect(s.staging.staged).toBe(true);
    expect(s.windshieldReviewed).toBe(true);
  });
});

describe('scene safety — scene lights (§17)', () => {
  it('requires a scene-light prompt in low visibility / near a roadway', () => {
    expect(normal().sceneLights.promptRequired).toBe(true);
    const s = showSceneLightPrompt(normal());
    expect(s.sceneLights.promptShown).toBe(true);
  });

  it('turning scene lights on reveals otherwise-hidden hazards', () => {
    const s = chooseSceneLight(normal(), 'scene_lights_on', bls01Scene);
    expect(s.sceneLights.on).toBe(true);
    expect(s.revealedFactorIds).toEqual(['standing_water', 'broken_glass']);
  });

  it('leaving lights off does not reveal hidden hazards', () => {
    const s = chooseSceneLight(normal(), 'lights_off', bls01Scene);
    expect(s.sceneLights.on).toBe(false);
    expect(s.revealedFactorIds).toEqual([]);
  });
});

describe('scene safety — ballistic & weather PPE (§18)', () => {
  it('prompts for ballistic PPE only on a credible weapons threat', () => {
    expect(normal().ballistic.promptRequired).toBe(false);
    expect(security().ballistic.promptRequired).toBe(true);
    const s = showBallisticPrompt(security());
    expect(s.ballistic.promptShown).toBe(true);
  });

  it('records a ballistic choice', () => {
    const s = chooseBallistic(security(), 'vests_and_helmets');
    expect(s.ballistic.choice).toBe('vests_and_helmets');
  });

  it('donning weather gear is tracked without blocking anything', () => {
    expect(donWeatherGear(normal()).weather.geared).toBe(true);
  });
});
