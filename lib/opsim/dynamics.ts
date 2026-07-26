/**
 * Scene Dynamics data (§20): typed distraction definitions with escalation
 * stages, severities, management actions, consequences, and difficulty scaling.
 * Distractions are purposeful — each is observable, escalates if ignored, and
 * resolves or improves when managed. The machine (dynamicsMachine.ts) drives
 * the lifecycle; escalation timing comes from the approved config.
 */

import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';

/** Approved escalation intervals (§20): first at 10s, then every 5s. Sourced from the pinned config. */
export const DEFAULT_ESCALATION = {
  firstSeconds: DEFAULT_SIMULATOR_CONFIG.timing.firstDistractionEscalationSeconds,
  subsequentSeconds: DEFAULT_SIMULATOR_CONFIG.timing.furtherDistractionEscalationSeconds,
} as const;

export type DynamicStatus =
  | 'developing'
  | 'escalating'
  | 'being_managed'
  | 'resolved'
  | 'immediate_safety_threat';

export const DYNAMIC_STATUS_LABELS: Record<DynamicStatus, string> = {
  developing: 'Developing',
  escalating: 'Escalating',
  being_managed: 'Being Managed',
  resolved: 'Resolved',
  immediate_safety_threat: 'Immediate Safety Threat',
};

/** Severity overlay. Scene Dynamics uses purple as its base; severity adds yellow/orange/red. */
export type DynamicSeverity = 'info' | 'yellow' | 'orange' | 'red';

export type DifficultyName = 'orientation' | 'basic' | 'intermediate' | 'advanced';

export interface DistractionStage {
  readonly description: string;
  readonly severity: DynamicSeverity;
  readonly immediateSafetyThreat?: boolean;
  /** The realistic consequence of leaving the distraction at this stage (§ consequences). */
  readonly consequence?: string;
}

export type ActionKind = 'assign' | 'self_improve' | 'self_resolve' | 'request_police' | 'ignore';

export interface DistractionAction {
  readonly id: string;
  readonly label: string;
  readonly kind: ActionKind;
  /** For an 'assign' action: the crew task a responder is given (real crew, not a fake model). */
  readonly crewTaskId?: string;
}

export interface DistractionType {
  readonly type: string;
  readonly label: string;
  readonly stages: readonly DistractionStage[];
  readonly actions: readonly DistractionAction[];
  /** Fire personnel awaiting assignment is NOT a negative distraction (§20). */
  readonly isFireAwaiting?: boolean;
}

const assign = (id: string, label: string, crewTaskId: string): DistractionAction => ({ id, label, kind: 'assign', crewTaskId });
const selfResolve = (id: string, label: string): DistractionAction => ({ id, label, kind: 'self_resolve' });
const selfImprove = (id: string, label: string): DistractionAction => ({ id, label, kind: 'self_improve' });

export const DISTRACTION_TYPES: Record<string, DistractionType> = {
  family: {
    type: 'family',
    label: 'Family / spouse',
    stages: [
      { description: 'Anxious and asking repeated questions', severity: 'yellow' },
      { description: 'Interrupting the patient interview', severity: 'yellow', consequence: 'Interruptions are slowing the interview.' },
      { description: 'Answering for the patient', severity: 'orange', consequence: 'The family is obscuring the patient’s own answers.' },
      { description: 'Moving between the crew and patient', severity: 'orange', consequence: 'You cannot get clear access to the patient.' },
      { description: 'Becoming verbally upset', severity: 'red', consequence: 'The disruption is delaying transport preparation.' },
    ],
    actions: [
      selfImprove('calm', 'Calm the family'),
      selfImprove('explain', 'Explain what the crew is doing'),
      selfImprove('step_aside', 'Ask family to step aside'),
      assign('assign_ron', 'Assign Partner Ron to the family', 'manage_family'),
      assign('assign_fire', 'Assign fire personnel to the family', 'manage_family'),
      selfResolve('privacy', 'Request privacy for the patient'),
      selfImprove('boundary', 'Set a respectful boundary'),
    ],
  },
  television: {
    type: 'television',
    label: 'Television / loud environment',
    stages: [
      { description: 'Television audible', severity: 'info' },
      { description: 'Volume becomes distracting', severity: 'yellow' },
      { description: 'Patient has difficulty hearing', severity: 'orange', consequence: 'The patient is missing your questions.' },
      { description: 'Effective communication becomes impossible', severity: 'red', consequence: 'The interview has stalled — you cannot hear each other.' },
    ],
    actions: [
      selfResolve('lower', 'Lower television volume'),
      selfResolve('off', 'Turn television off'),
      selfImprove('ask_family', 'Ask family to lower it'),
      assign('assign_room', 'Assign someone to manage the room', 'clear_pathway'),
      selfImprove('move_patient', 'Move the patient to a quieter location'),
    ],
  },
  bystander: {
    type: 'bystander',
    label: 'Bystander',
    stages: [
      { description: 'Watching', severity: 'info' },
      { description: 'Recording', severity: 'info' },
      { description: 'Moving closer', severity: 'yellow' },
      { description: 'Blocking access or interfering', severity: 'orange', consequence: 'The bystander is blocking equipment movement.' },
    ],
    actions: [
      selfImprove('boundary', 'Establish a safe boundary'),
      selfImprove('step_back', 'Ask the bystander to step back'),
      assign('assign_perimeter', 'Assign fire personnel to manage the perimeter', 'control_bystanders'),
      { id: 'police', label: 'Request police assistance', kind: 'request_police' },
      { id: 'ignore', label: 'Ignore lawful recording (not interfering)', kind: 'ignore' },
      assign('clear_path', 'Clear a pathway', 'clear_pathway'),
    ],
  },
  patient_behavior: {
    type: 'patient_behavior',
    label: 'Patient behavior',
    stages: [
      { description: 'Frustrated and questioning the need for transport', severity: 'yellow' },
      { description: 'Increasingly resistant', severity: 'orange', consequence: 'The patient is becoming less cooperative.' },
      { description: 'Refusing transport', severity: 'orange', consequence: 'A refusal needs a capacity check and a risks/alternatives discussion.' },
      { description: 'Verbally resistant', severity: 'red', consequence: 'Care is stalled until you rebuild rapport.' },
    ],
    actions: [
      selfImprove('calm', 'Speak calmly'),
      selfImprove('ask_why', 'Ask what is driving the refusal or anger'),
      selfImprove('explain_risks', 'Explain risks and alternatives'),
      selfImprove('capacity', 'Confirm decision-making capacity'),
      selfImprove('privacy', 'Give the patient privacy'),
      assign('ron_rapport', 'Ask Ron to build rapport', 'interview_patient'),
      { id: 'police', label: 'Request police (only for a legitimate safety concern)', kind: 'request_police' },
    ],
  },
  traffic: {
    type: 'traffic',
    label: 'Traffic',
    stages: [
      { description: 'Traffic passing near the scene', severity: 'yellow' },
      { description: 'Horns and hard braking', severity: 'orange' },
      { description: 'Near miss', severity: 'red', consequence: 'A near miss just forced everyone to scatter.' },
      { description: 'Immediate roadway danger', severity: 'red', immediateSafetyThreat: true, consequence: 'Personnel are in immediate danger in the roadway.' },
    ],
    actions: [
      assign('engine_block', 'Assign an engine to roadway protection', 'manage_traffic'),
      { id: 'police', label: 'Request police traffic control', kind: 'request_police' },
      selfImprove('reposition', 'Reposition apparatus'),
      selfImprove('move_personnel', 'Move personnel or patient to a safer area'),
      selfResolve('suspend', 'Suspend unsafe activity until protection is established'),
    ],
  },
  crowd: {
    type: 'crowd',
    label: 'Crowd',
    stages: [
      { description: 'Gathering nearby', severity: 'yellow' },
      { description: 'Increasing noise and questions', severity: 'yellow', consequence: 'Crowd noise is making communication hard.' },
      { description: 'Moving into the work area', severity: 'orange' },
      { description: 'Interfering with patient care or equipment', severity: 'red', consequence: 'The crowd is interfering with patient care.' },
    ],
    actions: [
      assign('crowd_control', 'Assign a responder to crowd control', 'control_bystanders'),
      selfImprove('perimeter', 'Establish a perimeter'),
      { id: 'police', label: 'Ask police for assistance', kind: 'request_police' },
      selfImprove('move_care', 'Move care to a more controlled area'),
      selfImprove('instruction', 'Give the crowd a clear instruction'),
    ],
  },
  animal: {
    type: 'animal',
    label: 'Uncontrolled animal',
    stages: [
      { description: 'Animal visible', severity: 'yellow' },
      { description: 'Animal approaches crew', severity: 'orange' },
      { description: 'Animal barks, growls, or blocks access', severity: 'orange', consequence: 'The animal is preventing entry.' },
      { description: 'Immediate bite or safety threat', severity: 'red', immediateSafetyThreat: true, consequence: 'The animal is an immediate safety threat.' },
    ],
    actions: [
      selfImprove('owner_secure', 'Ask owner to secure the animal'),
      selfResolve('withdraw', 'Withdraw and stage'),
      { id: 'police', label: 'Request animal control or police', kind: 'request_police' },
      selfImprove('reposition', 'Reposition'),
      selfImprove('safe_path', 'Establish a safe path'),
    ],
  },
  fire_awaiting: {
    type: 'fire_awaiting',
    label: 'Fire personnel awaiting assignment',
    isFireAwaiting: true,
    stages: [{ description: 'Fire personnel awaiting assignment', severity: 'info' }],
    actions: [],
  },
};

export function distractionType(type: string): DistractionType | undefined {
  return DISTRACTION_TYPES[type];
}

/** Difficulty scaling (§ difficulty): how many major distractions can run at once. */
export interface DifficultyConfig {
  readonly name: DifficultyName;
  readonly maxSimultaneous: number;
}

export const DIFFICULTY_CONFIG: Record<DifficultyName, DifficultyConfig> = {
  orientation: { name: 'orientation', maxSimultaneous: 1 },
  basic: { name: 'basic', maxSimultaneous: 2 },
  intermediate: { name: 'intermediate', maxSimultaneous: 3 },
  advanced: { name: 'advanced', maxSimultaneous: 5 },
};

/** Ron's escalating prompts for a critical unresolved dynamic (max 3, §6/§20). */
export const RON_DYNAMICS_PROMPTS: readonly string[] = [
  'Partner, that family member is starting to interfere.',
  'We’re losing the patient’s attention. How do you want to handle the family?',
  'Partner, we need to address this now.',
];

export const RON_DYNAMICS_ACK = [
  'Nice. That gave us some room to work.',
  'Good call. I’ve got the family.',
] as const;
