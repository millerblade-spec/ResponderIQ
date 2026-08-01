import { describe, it, expect } from 'vitest';
import {
  createTransportState,
  chooseDevice,
  deviceDelivered,
  choosePelvicSupport,
  pelvicDelivered,
  securePatient,
  beginDescent,
  completeDescent,
  completeAlsWorkup,
  transferToStretcher,
  choosePainManagement,
  rigidDeviceUsed,
  type TransportState,
} from './transportMachine';
import { STAIR_CHAIR_DESCENT_RULING } from './transport';

const at = (s: TransportState, id: string) => s.events.some((e) => e.id === id);

function throughDescent(deviceId = 'scoop_stretcher', pelvic = 'improvised_sheet') {
  let s = createTransportState();
  s = chooseDevice(s, deviceId, { onScene: true, atSecond: 100 });
  s = choosePelvicSupport(s, pelvic, { onScene: true, atSecond: 110 });
  s = securePatient(s, 140);
  s = beginDescent(s, 3, 150);
  s = completeDescent(s, 240);
  return s;
}

describe('transport machine — device choice (fix #12)', () => {
  it('an on-scene device goes straight to the pelvic decision', () => {
    const s = chooseDevice(createTransportState(), 'scoop_stretcher', { onScene: true, atSecond: 5 });
    expect(s.deviceId).toBe('scoop_stretcher');
    expect(s.deviceNeededRetrieval).toBe(false);
    expect(s.stage).toBe('pelvic_choice');
  });

  it('an off-scene device costs a walk-back first (the realistic consequence, §9)', () => {
    let s = chooseDevice(createTransportState(), 'backboard', { onScene: false, atSecond: 5 });
    expect(s.stage).toBe('device_retrieval');
    expect(s.deviceNeededRetrieval).toBe(true);
    s = deviceDelivered(s, 50);
    expect(s.stage).toBe('pelvic_choice');
    expect(at(s, 'device_delivered')).toBe(true);
  });

  it('rejects unknown devices', () => {
    const s = createTransportState();
    expect(chooseDevice(s, 'helicopter', { onScene: true, atSecond: 5 })).toBe(s);
  });

  it('the stair-chair descent ruling is still the recorded open question', () => {
    // Deliberate guard: if someone resolves the ruling, the debrief/scoring
    // wiring for the stair-chair descent must be finished at the same time.
    expect(STAIR_CHAIR_DESCENT_RULING).toBe('unresolved');
  });
});

describe('transport machine — pelvic support (fix #12)', () => {
  const atPelvic = () => chooseDevice(createTransportState(), 'scoop_stretcher', { onScene: true, atSecond: 5 });

  it('the improvised sheet needs no retrieval — it is a first-class correct option', () => {
    const s = choosePelvicSupport(atPelvic(), 'improvised_sheet', { onScene: false, atSecond: 10 });
    expect(s.stage).toBe('securing');
    expect(s.pelvicNeededRetrieval).toBe(false);
  });

  it('"not indicated" is a recordable decision, not a skip', () => {
    const s = choosePelvicSupport(atPelvic(), 'none', { onScene: true, atSecond: 10 });
    expect(s.pelvicSupportId).toBe('none');
    expect(s.stage).toBe('securing');
  });

  it('an off-scene binder costs the walk-back', () => {
    let s = choosePelvicSupport(atPelvic(), 'pelvic_binder', { onScene: false, atSecond: 10 });
    expect(s.stage).toBe('pelvic_retrieval');
    s = pelvicDelivered(s, 55);
    expect(s.stage).toBe('securing');
  });
});

describe('transport machine — securing, descent, ALS workup (fixes #13, #14)', () => {
  it('records how many fire personnel physically helped on the stairs', () => {
    const s = throughDescent();
    expect(s.fireAssistCount).toBe(3);
    expect(s.stage).toBe('als_workup');
  });

  it('a no-fire descent is possible but recorded (debrief material, not a hidden block)', () => {
    let s = chooseDevice(createTransportState(), 'backboard', { onScene: true, atSecond: 5 });
    s = choosePelvicSupport(s, 'none', { onScene: true, atSecond: 10 });
    s = securePatient(s, 20);
    s = beginDescent(s, 0, 30);
    expect(s.fireAssistCount).toBe(0);
  });

  it('the paramedic workup completes into the stretcher transfer', () => {
    const s = completeAlsWorkup(throughDescent(), 300);
    expect(s.alsWorkupDone).toBe(true);
    expect(s.stage).toBe('stretcher_transfer');
  });
});

describe('transport machine — stretcher transfer & board removal (fix #15)', () => {
  const atTransfer = (device = 'backboard') => completeAlsWorkup(throughDescent(device), 300);

  it('removing the rigid device before transport is recorded as the taken action', () => {
    const s = transferToStretcher(atTransfer(), { removeRigidDevice: true, atSecond: 320 });
    expect(rigidDeviceUsed(s)).toBe(true);
    expect(s.rigidDeviceRemovedBeforeTransport).toBe(true);
    expect(s.stage).toBe('pain_decision');
  });

  it('leaving the patient on the board is allowed and recorded', () => {
    const s = transferToStretcher(atTransfer(), { removeRigidDevice: false, atSecond: 320 });
    expect(s.rigidDeviceRemovedBeforeTransport).toBe(false);
  });

  it('a non-rigid device leaves the removal question moot (null)', () => {
    const s = transferToStretcher(completeAlsWorkup(throughDescent('stair_chair'), 300), { atSecond: 320 });
    expect(rigidDeviceUsed(s)).toBe(false);
    expect(s.rigidDeviceRemovedBeforeTransport).toBeNull();
  });
});

describe('transport machine — the binary pain ending (fix #16)', () => {
  const atPain = () => transferToStretcher(completeAlsWorkup(throughDescent(), 300), { removeRigidDevice: true, atSecond: 320 });

  it('give ends the scenario', () => {
    const s = choosePainManagement(atPain(), 'give', 400);
    expect(s.painMedicationGiven).toBe(true);
    expect(s.stage).toBe('complete');
  });

  it('withhold ends the scenario just the same — the choice is binary at this tier', () => {
    const s = choosePainManagement(atPain(), 'withhold', 400);
    expect(s.painMedicationGiven).toBe(false);
    expect(s.stage).toBe('complete');
  });

  it('stages cannot be skipped', () => {
    const s = createTransportState();
    expect(choosePainManagement(s, 'give', 5)).toBe(s);
    expect(transferToStretcher(s, { atSecond: 5 })).toBe(s);
    expect(securePatient(s, 5)).toBe(s);
  });
});
