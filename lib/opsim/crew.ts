/**
 * Personnel, apparatus, and task data for the crew-resource-management system
 * (§10–§14). Typed and framework-free; the pure state machine (crewMachine.ts)
 * operates on these, and the components render them.
 *
 * The equipment "bring" tasks are derived from the shared EQUIPMENT_CATALOG —
 * inventory is never redefined here (§ architecture).
 */
import { EQUIPMENT_CATALOG, equipmentLabel } from './equipment';

export type ResponderRole = 'lead_medic' | 'partner_ron' | 'fire_officer' | 'firefighter';

/** The only allowed personnel statuses (§12). Note: never "Available". */
export type PersonnelStatus =
  | 'awaiting_assignment'
  | 'assigned'
  | 'task_in_progress'
  | 'task_complete'
  | 'cleared_from_call'
  | 'unavailable';

export const STATUS_LABELS: Record<PersonnelStatus, string> = {
  awaiting_assignment: 'Awaiting Assignment',
  assigned: 'Assigned',
  task_in_progress: 'Task in Progress',
  task_complete: 'Task Complete',
  cleared_from_call: 'Cleared from Call',
  unavailable: 'Unavailable',
};

export interface Responder {
  readonly id: string;
  readonly name: string;
  readonly role: ResponderRole;
  /** Fire personnel belong to an engine; the medic crew has no apparatus. */
  readonly apparatusId?: string;
}

export type EngineRole = 'single' | 'roadway_block' | 'support';

export interface Apparatus {
  readonly id: string;
  readonly name: string;
  readonly role: EngineRole;
  readonly memberIds: readonly string[];
}

export type TaskCategory = 'equipment' | 'patient_care' | 'scene_ops';

export interface TaskDef {
  readonly id: string;
  readonly label: string;
  readonly category: TaskCategory;
  /** Estimated completion time in seconds, when applicable. */
  readonly durationSeconds?: number;
  /** Completing this task would surface clinical findings — gated by the clinical lock (§19). */
  readonly revealsClinical?: boolean;
  /** For an equipment "bring" task: the catalog id it delivers (drives the 45s retrieval when off-truck). */
  readonly equipmentId?: string;
  /** Assigning this to fire personnel while the hazard is uncontrolled draws the officer's safety response (§13). */
  readonly safetyHazard?: boolean;
  /** A roadway-blocking / safety role that blocks clearing the engine (§14). */
  readonly obligation?: 'roadway_block' | 'safety';
}

/** "Bring <equipment>" tasks, derived from the shared catalog (§12). */
export const EQUIPMENT_TASKS: readonly TaskDef[] = EQUIPMENT_CATALOG.map((e) => ({
  id: `bring_${e.id}`,
  label: `Bring ${e.label}`,
  category: 'equipment' as const,
  equipmentId: e.id,
}));

export const PATIENT_CARE_TASKS: readonly TaskDef[] = [
  { id: 'initial_assessment', label: 'Initial (primary) assessment', category: 'patient_care', durationSeconds: 60, revealsClinical: true },
  { id: 'obtain_vitals', label: 'Obtain vital signs', category: 'patient_care', durationSeconds: 60, revealsClinical: true },
  { id: 'apply_monitor', label: 'Apply cardiac monitor', category: 'patient_care', durationSeconds: 45, revealsClinical: true },
  { id: 'obtain_12_lead', label: 'Obtain 12-lead ECG', category: 'patient_care', durationSeconds: 90, revealsClinical: true },
  { id: 'check_glucose', label: 'Check blood glucose', category: 'patient_care', durationSeconds: 30, revealsClinical: true },
  { id: 'apply_oxygen', label: 'Apply oxygen', category: 'patient_care', durationSeconds: 30 },
  { id: 'prepare_iv', label: 'Prepare IV equipment', category: 'patient_care', durationSeconds: 45 },
  { id: 'establish_iv', label: 'Establish IV access', category: 'patient_care', durationSeconds: 90 },
  { id: 'prepare_io', label: 'Prepare IO equipment', category: 'patient_care', durationSeconds: 45 },
  { id: 'control_bleeding', label: 'Control bleeding', category: 'patient_care', durationSeconds: 60 },
  { id: 'assist_ventilation', label: 'Assist ventilation', category: 'patient_care' },
  { id: 'interview_patient', label: 'Interview patient', category: 'patient_care', durationSeconds: 60, revealsClinical: true },
  { id: 'focused_assessment', label: 'Perform focused assessment', category: 'patient_care', durationSeconds: 90, revealsClinical: true },
  { id: 'reassess_patient', label: 'Reassess patient', category: 'patient_care', durationSeconds: 60, revealsClinical: true },
  { id: 'assist_movement', label: 'Assist with patient movement', category: 'patient_care', durationSeconds: 90 },
];

export const SCENE_OPS_TASKS: readonly TaskDef[] = [
  { id: 'prepare_stretcher', label: 'Prepare stretcher', category: 'scene_ops', durationSeconds: 45 },
  { id: 'move_stretcher', label: 'Move stretcher closer', category: 'scene_ops', durationSeconds: 60 },
  { id: 'clear_pathway', label: 'Clear pathway', category: 'scene_ops', durationSeconds: 60 },
  { id: 'calm_family', label: 'Calm family', category: 'scene_ops', durationSeconds: 60 },
  { id: 'manage_family', label: 'Manage family', category: 'scene_ops', durationSeconds: 60 },
  { id: 'control_bystanders', label: 'Control bystanders', category: 'scene_ops', durationSeconds: 60 },
  { id: 'check_additional_patients', label: 'Check for additional patients', category: 'scene_ops', durationSeconds: 60 },
  { id: 'assist_lifting', label: 'Assist lifting', category: 'scene_ops', durationSeconds: 60 },
  { id: 'manage_traffic', label: 'Manage traffic', category: 'scene_ops', durationSeconds: 120, obligation: 'safety' },
  { id: 'coordinate_police', label: 'Coordinate with police', category: 'scene_ops', durationSeconds: 60 },
  { id: 'maintain_scene_safety', label: 'Maintain scene safety', category: 'scene_ops', obligation: 'safety' },
  { id: 'prepare_stair_chair', label: 'Prepare stair chair', category: 'scene_ops', durationSeconds: 45 },
  { id: 'support_extrication', label: 'Support extrication', category: 'scene_ops', durationSeconds: 180, obligation: 'safety', safetyHazard: true },
  { id: 'stand_by', label: 'Stand by for assignment', category: 'scene_ops' },
];

export const ALL_TASKS: readonly TaskDef[] = [...EQUIPMENT_TASKS, ...PATIENT_CARE_TASKS, ...SCENE_OPS_TASKS];

export function taskDef(id: string): TaskDef | undefined {
  return ALL_TASKS.find((t) => t.id === id);
}

/** The equipment name a "bring" task delivers, for retrieval status text (§9). */
export function equipmentLabelForTask(taskId: string): string {
  const def = taskDef(taskId);
  return def?.equipmentId ? equipmentLabel(def.equipmentId) : (def?.label ?? taskId);
}

/** Additional resources the learner may request (§ resource escalation). Never auto-requested. */
export const RESOURCE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'additional_micu', label: 'Additional MICU' },
  { id: 'additional_engine', label: 'Additional engine' },
  { id: 'ems_supervisor', label: 'EMS supervisor' },
  { id: 'battalion_chief', label: 'Battalion chief' },
  { id: 'police', label: 'Police' },
  { id: 'heavy_rescue', label: 'Heavy rescue' },
  { id: 'air_medical', label: 'Air medical' },
  { id: 'hazmat', label: 'HazMat' },
  { id: 'technical_rescue', label: 'Technical rescue' },
  { id: 'utility_company', label: 'Utility company' },
];

/** The ordered arrival audio sequence for an engine (§11). Actual audio lands in the audio slice. */
export const ENGINE_ARRIVAL_AUDIO: readonly string[] = [
  'siren_approach',
  'siren_wind_down',
  'air_brakes',
  'engine_idle',
];

export const RON_CREW_LINES = {
  engineArrival: 'Engine’s here—here they come!',
  officerOffer: 'Medic 3, what can we do to help?',
  awaitingPrompt: 'Partner, we’ve got people awaiting assignment. How do you want to use them?',
  moreHelp: 'Partner, do we need more help? Who do you want?',
} as const;

export const OFFICER_LINES = {
  accept: 'We can do that.',
  safety: 'We can help, but I can’t put my crew through that area until the hazard is controlled.',
} as const;

/**
 * The fire response for a call type (§10): one engine for an EMS call; two for a
 * two-vehicle accident (first blocks the roadway, second supports patient care /
 * rescue). Members are an officer + three firefighters per engine.
 */
export type CallType = 'ems' | 'mvc_two_vehicle';

export function fireResponseFor(callType: CallType): readonly Apparatus[] {
  if (callType === 'mvc_two_vehicle') {
    return [engine('engine_1', 'Engine 1', 'roadway_block'), engine('engine_2', 'Engine 2', 'support')];
  }
  return [engine('engine_4', 'Engine 4', 'single')];
}

function engine(id: string, name: string, role: EngineRole): Apparatus {
  return { id, name, role, memberIds: [`${id}_officer`, `${id}_ff1`, `${id}_ff2`, `${id}_ff3`] };
}

/** Builds the fire responders for an engine (officer + three firefighters). */
export function engineResponders(engine: Apparatus): readonly Responder[] {
  return [
    { id: `${engine.id}_officer`, name: `${engine.name} Officer`, role: 'fire_officer', apparatusId: engine.id },
    { id: `${engine.id}_ff1`, name: `${engine.name} FF 1`, role: 'firefighter', apparatusId: engine.id },
    { id: `${engine.id}_ff2`, name: `${engine.name} FF 2`, role: 'firefighter', apparatusId: engine.id },
    { id: `${engine.id}_ff3`, name: `${engine.name} FF 3`, role: 'firefighter', apparatusId: engine.id },
  ];
}

/** The medic crew — always present from the start (§12). */
export const MEDIC_CREW: readonly Responder[] = [
  { id: 'lead_medic', name: 'You (Lead Medic)', role: 'lead_medic' },
  { id: 'partner_ron', name: 'Partner Ron', role: 'partner_ron' },
];
