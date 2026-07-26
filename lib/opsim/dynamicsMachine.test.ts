import { describe, it, expect } from 'vitest';
import {
  createDynamicsState,
  appearDistraction,
  escalate,
  improve,
  resolveDirect,
  beginManaging,
  resolveManagement,
  cancelManaging,
  ronPrompt,
  isAtMaxStage,
  currentConsequence,
} from './dynamicsMachine';
import { DISTRACTION_TYPES, DEFAULT_ESCALATION } from './dynamics';
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';

function withFamily(difficulty: 'orientation' | 'basic' | 'intermediate' | 'advanced' = 'basic') {
  return appearDistraction(createDynamicsState(difficulty), 'fam', 'family', 100);
}

describe('Scene Dynamics — appearance & difficulty (§20)', () => {
  it('a distraction appears at its start with status Developing', () => {
    const s = withFamily();
    expect(s.issues.fam.type).toBe('family');
    expect(s.issues.fam.status).toBe('developing');
    expect(s.issues.fam.stageIndex).toBe(0);
  });

  it('Orientation generally presents one major distraction at a time', () => {
    let s = appearDistraction(createDynamicsState('orientation'), 'fam', 'family', 100);
    s = appearDistraction(s, 'tv', 'television', 101); // blocked by the cap
    expect(Object.keys(s.issues)).toEqual(['fam']);
  });

  it('Advanced can present multiple competing distractions', () => {
    let s = createDynamicsState('advanced');
    s = appearDistraction(s, 'fam', 'family', 100);
    s = appearDistraction(s, 'tv', 'television', 101);
    s = appearDistraction(s, 'by', 'bystander', 102);
    expect(Object.keys(s.issues).length).toBe(3);
  });

  it('fire personnel awaiting assignment never counts against the cap (§20)', () => {
    let s = appearDistraction(createDynamicsState('orientation'), 'fam', 'family', 100);
    s = appearDistraction(s, 'fire', 'fire_awaiting', 101);
    expect(Object.keys(s.issues)).toEqual(['fam', 'fire']); // fire-awaiting still allowed
  });
});

describe('Scene Dynamics — escalation (§20)', () => {
  it('uses the approved 10s-then-5s intervals from config', () => {
    expect(DEFAULT_ESCALATION.firstSeconds).toBe(DEFAULT_SIMULATOR_CONFIG.timing.firstDistractionEscalationSeconds);
    expect(DEFAULT_ESCALATION.subsequentSeconds).toBe(DEFAULT_SIMULATOR_CONFIG.timing.furtherDistractionEscalationSeconds);
    expect(DEFAULT_ESCALATION.firstSeconds).toBe(10);
    expect(DEFAULT_ESCALATION.subsequentSeconds).toBe(5);
  });

  it('advances one stage per escalation and stops at the configured maximum', () => {
    let s = withFamily();
    const maxIndex = DISTRACTION_TYPES.family.stages.length - 1;
    for (let i = 0; i < 10; i++) s = escalate(s, 'fam');
    expect(s.issues.fam.stageIndex).toBe(maxIndex);
    expect(isAtMaxStage(s, 'fam')).toBe(true);
  });

  it('does not escalate a resolved distraction', () => {
    let s = withFamily();
    s = resolveDirect(s, 'fam', 'privacy', 105);
    const before = s.issues.fam.stageIndex;
    s = escalate(s, 'fam');
    expect(s.issues.fam.stageIndex).toBe(before);
  });

  it('pauses escalation while being managed and resumes after cancel', () => {
    let s = withFamily();
    s = beginManaging(s, 'fam', 'partner_ron', 'assign_ron', 105);
    expect(s.issues.fam.status).toBe('being_managed');
    const paused = escalate(s, 'fam');
    expect(paused.issues.fam.stageIndex).toBe(0); // no escalation while managed
    s = cancelManaging(paused, 'fam');
    expect(s.issues.fam.status).toBe('escalating');
    s = escalate(s, 'fam');
    expect(s.issues.fam.stageIndex).toBe(1); // resumes
  });

  it('reaches an Immediate Safety Threat at the top of traffic and animal progressions', () => {
    for (const type of ['traffic', 'animal']) {
      let s = appearDistraction(createDynamicsState('advanced'), type, type, 100);
      const max = DISTRACTION_TYPES[type].stages.length - 1;
      for (let i = 0; i < max; i++) s = escalate(s, type);
      expect(s.issues[type].status).toBe('immediate_safety_threat');
    }
  });
});

describe('Scene Dynamics — per-type progressions (§20)', () => {
  it('has the approved stage counts for each type', () => {
    expect(DISTRACTION_TYPES.family.stages).toHaveLength(5);
    expect(DISTRACTION_TYPES.television.stages).toHaveLength(4);
    expect(DISTRACTION_TYPES.bystander.stages).toHaveLength(4);
    expect(DISTRACTION_TYPES.patient_behavior.stages).toHaveLength(4);
    expect(DISTRACTION_TYPES.traffic.stages).toHaveLength(4);
    expect(DISTRACTION_TYPES.crowd.stages).toHaveLength(4);
    expect(DISTRACTION_TYPES.animal.stages).toHaveLength(4);
  });

  it('treats a lawfully-recording bystander as info, not a safety threat', () => {
    const recording = DISTRACTION_TYPES.bystander.stages[1];
    expect(recording.description).toMatch(/recording/i);
    expect(recording.severity).toBe('info');
    expect(recording.immediateSafetyThreat).toBeUndefined();
    // An explicit "ignore lawful recording" action exists.
    expect(DISTRACTION_TYPES.bystander.actions.find((a) => a.kind === 'ignore')).toBeDefined();
  });

  it('exposes a realistic consequence as a distraction worsens', () => {
    let s = withFamily();
    s = escalate(s, 'fam'); // stage 1
    s = escalate(s, 'fam'); // stage 2 — answering for the patient
    expect(currentConsequence(s, 'fam')).toMatch(/obscuring the patient/i);
  });

  it('carries no clinical findings in distraction data (kept separate, §20)', () => {
    const text = JSON.stringify(DISTRACTION_TYPES).toLowerCase();
    expect(text).not.toMatch(/blood pressure|\bbpm\b|glucose|\bspo2\b|heart rate|diagnosis/);
  });
});

describe('Scene Dynamics — management & Ron (§20)', () => {
  it('improving reduces a stage and resolves at the bottom', () => {
    let s = withFamily();
    s = escalate(s, 'fam'); // stage 1
    s = improve(s, 'fam', 'calm', 110); // -> stage 0, resolved
    expect(s.issues.fam.resolved).toBe(true);
    expect(s.issues.fam.status).toBe('resolved');
  });

  it('management completion resolves the issue', () => {
    let s = withFamily();
    s = beginManaging(s, 'fam', 'partner_ron', 'assign_ron', 105);
    s = resolveManagement(s, 'fam');
    expect(s.issues.fam.resolved).toBe(true);
  });

  it('records debrief data: recognition and time to first action', () => {
    let s = withFamily();
    s = improve(s, 'fam', 'calm', 112);
    expect(s.issues.fam.recognized).toBe(true);
    expect(s.issues.fam.firstActionAtSecond).toBe(112);
    expect(s.issues.fam.actions).toHaveLength(1);
  });

  it('Ron prompts at most three times', () => {
    let s = withFamily();
    const idxs: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const r = ronPrompt(s);
      s = r.state;
      idxs.push(r.index);
    }
    expect(idxs).toEqual([0, 1, 2, null, null]);
    expect(s.ronPromptCount).toBe(3);
  });
});
