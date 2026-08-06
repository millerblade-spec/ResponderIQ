/**
 * Clinical information model and action definitions (§19). Findings live here
 * but are revealed ONLY when the learner (or an assigned responder) completes
 * the obtaining action — the machine (clinicalMachine.ts) tracks visibility.
 * Every reported piece of information carries a source label.
 */

export type FindingSource = 'patient' | 'family' | 'bystander' | 'dispatch' | 'exam' | 'device';

export const FINDING_SOURCE_LABELS: Record<FindingSource, string> = {
  patient: 'Patient reported',
  family: 'Family reported',
  bystander: 'Bystander reported',
  dispatch: 'Dispatch reported',
  exam: 'Exam finding',
  device: 'Device reading',
};

export type ClinicalSection =
  | 'patient_status'
  | 'vitals'
  | 'interview'
  | 'focused_exam'
  | 'cardiac'
  | 'reassessment';

export interface ClinicalActionDef {
  readonly id: string;
  readonly label: string;
  readonly section: ClinicalSection;
  /** The shared-crew task this maps to (no second personnel model, §19). */
  readonly crewTaskId: string;
  /** Equipment that must be on scene before this action is available (§19). */
  readonly requiredEquipmentId?: string;
  /** Another clinical action that must complete first (e.g. 12-lead needs the monitor applied). */
  readonly requiresActionId?: string;
  /** For focused exams: the body region examined. */
  readonly region?: string;
  readonly durationSeconds: number;
}

export const EXAM_REGIONS = [
  { id: 'head_face', label: 'Head & face' },
  { id: 'neck', label: 'Neck' },
  { id: 'chest', label: 'Chest' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'pelvis', label: 'Pelvis' },
  { id: 'back', label: 'Back' },
  { id: 'extremities', label: 'Extremities' },
  { id: 'neuro', label: 'Neurologic' },
  { id: 'respiratory', label: 'Respiratory' },
  { id: 'cardiac', label: 'Cardiac' },
] as const;

export const CLINICAL_ACTIONS: readonly ClinicalActionDef[] = [
  { id: 'initial_assessment', label: 'Initial (primary) assessment', section: 'patient_status', crewTaskId: 'initial_assessment', durationSeconds: 60 },
  // He's talking to you — that confirms airway/breathing/circulation quickly,
  // without separate explicit checks for each (fix #11).
  { id: 'confirm_abc_talking', label: 'He’s talking — confirm ABCs from that', section: 'patient_status', crewTaskId: 'confirm_abc', durationSeconds: 5 },
  { id: 'obtain_vitals', label: 'Obtain vital signs', section: 'vitals', crewTaskId: 'obtain_vitals', durationSeconds: 60 },
  { id: 'interview', label: 'Patient interview', section: 'interview', crewTaskId: 'interview_patient', durationSeconds: 60 },
  { id: 'ask_worst_pain', label: 'Ask what hurts most', section: 'interview', crewTaskId: 'ask_worst_pain', durationSeconds: 10 },
  ...EXAM_REGIONS.map((r) => ({
    id: `exam_${r.id}`,
    label: `Focused exam — ${r.label}`,
    section: 'focused_exam' as const,
    crewTaskId: 'focused_assessment',
    region: r.id,
    durationSeconds: 45,
  })),
  { id: 'check_glucose', label: 'Check blood glucose', section: 'vitals', crewTaskId: 'check_glucose', requiredEquipmentId: 'als_bag', durationSeconds: 30 },
  { id: 'apply_monitor', label: 'Apply cardiac monitor', section: 'cardiac', crewTaskId: 'apply_monitor', requiredEquipmentId: 'cardiac_monitor', durationSeconds: 45 },
  { id: 'obtain_12_lead', label: 'Obtain 12-lead ECG', section: 'cardiac', crewTaskId: 'obtain_12_lead', requiredEquipmentId: 'cardiac_monitor', requiresActionId: 'apply_monitor', durationSeconds: 90 },
  { id: 'reassess', label: 'Reassess patient', section: 'reassessment', crewTaskId: 'reassess_patient', durationSeconds: 60 },
];

export function clinicalAction(id: string): ClinicalActionDef | undefined {
  return CLINICAL_ACTIONS.find((a) => a.id === id);
}

export interface VitalSet {
  readonly hr: string;
  readonly rr: string;
  readonly bp: string;
  readonly spo2: string;
  readonly temp?: string;
  readonly pain: string;
}

export interface SourcedFinding {
  readonly text: string;
  readonly source: FindingSource;
}

export interface InterviewSection {
  readonly key: string;
  readonly label: string;
  readonly finding: SourcedFinding;
}

export interface ClinicalModel {
  readonly initialAssessment: {
    readonly appearance: string;
    readonly responsiveness: string;
    readonly airway: string;
    readonly breathing: string;
    readonly circulation: string;
    readonly lifeThreats: string;
  };
  /** True when the patient is talking on contact — talking confirms ABCs quickly (fix #11). */
  readonly patientTalking: boolean;
  /** The quick-confirm readout when the talking patient's ABCs are confirmed from speech. */
  readonly abcTalkingConfirm: SourcedFinding;
  /** The answer to "what hurts most?" (fix #11). */
  readonly worstComplaint: SourcedFinding;
  readonly vitals: VitalSet;
  /** Shown by reassessment once deterioration has occurred (§ deterioration). */
  readonly vitalsDeteriorated: VitalSet;
  readonly interview: readonly InterviewSection[];
  /** The paramedic's own questions during the ALS workup (fix #14): why he fell, any new medications. */
  readonly paramedicQuestions: readonly InterviewSection[];
  readonly exam: Readonly<Record<string, SourcedFinding>>;
  readonly glucose: SourcedFinding;
  readonly monitorRhythm: SourcedFinding;
  readonly twelveLead: SourcedFinding;
  /** Seconds after clinical unlock at which the patient deteriorates if not moving toward definitive care. */
  readonly deteriorationAtSecond: number;
  readonly deteriorationNote: string;
}

/**
 * BLS-01 clinical picture: an older adult on anticoagulation who felt
 * lightheaded and fell — the real story (atrial fibrillation, a possible
 * syncopal event) only emerges through assessment, not from the "I'm fine".
 */
export const bls01Clinical: ClinicalModel = {
  initialAssessment: {
    appearance: 'Older man sitting on the floor, awake but pale.',
    responsiveness: 'Alert and oriented (A on AVPU).',
    airway: 'Patent — speaking in full sentences.',
    breathing: 'Slightly increased effort, no distress.',
    circulation: 'Skin pale and cool; no obvious major bleeding.',
    lifeThreats: 'No immediate life threat identified on the primary assessment.',
  },
  patientTalking: true,
  abcTalkingConfirm: {
    text: 'He’s talking to you in full sentences — airway open, breathing adequate, circulation supporting speech. ABCs confirmed without separate checks.',
    source: 'exam',
  },
  worstComplaint: { text: '“My hip. Right side. Don’t make me sit up — I can’t.”', source: 'patient' },
  vitals: { hr: '96, irregular', rr: '20', bp: '148/88', spo2: '94% on room air', temp: '98.4°F', pain: '3/10 (right hip)' },
  vitalsDeteriorated: { hr: '124, irregularly irregular', rr: '24', bp: '104/68', spo2: '89% on room air', temp: '98.2°F', pain: '6/10' },
  interview: [
    { key: 'chief_complaint', label: 'Chief complaint', finding: { text: '“I just slipped getting up — I’m fine.”', source: 'patient' } },
    { key: 'onset_events', label: 'Onset & events', finding: { text: 'Daughter says he “blacked out for a second” before going down.', source: 'family' } },
    { key: 'symptoms', label: 'Symptoms', finding: { text: 'Felt lightheaded and had palpitations beforehand; right hip hurts now.', source: 'patient' } },
    { key: 'allergies', label: 'Allergies', finding: { text: 'No known drug allergies.', source: 'patient' } },
    { key: 'medications', label: 'Medications', finding: { text: 'Metoprolol, apixaban (a blood thinner), lisinopril.', source: 'patient' } },
    { key: 'history', label: 'Medical history', finding: { text: 'Atrial fibrillation and high blood pressure.', source: 'patient' } },
    { key: 'last_intake', label: 'Last oral intake', finding: { text: 'Coffee this morning, no breakfast.', source: 'patient' } },
    { key: 'context', label: 'Pertinent context', finding: { text: 'Lives alone; daughter says this is his third fall this month.', source: 'family' } },
  ],
  paramedicQuestions: [
    { key: 'why_fell', label: 'Why did you fall?', finding: { text: '“Got up off the couch and the room spun. Next thing I was down.”', source: 'patient' } },
    { key: 'new_medications', label: 'Any new medications?', finding: { text: 'His doctor increased his metoprolol dose last week.', source: 'patient' } },
  ],
  exam: {
    head_face: { text: 'No obvious head trauma or lacerations.', source: 'exam' },
    neck: { text: 'No midline tenderness; trachea midline.', source: 'exam' },
    chest: { text: 'No deformity; equal chest rise; no crepitus.', source: 'exam' },
    abdomen: { text: 'Soft, non-tender.', source: 'exam' },
    pelvis: { text: 'Tender over the right side with gentle compression; no gross instability. Trying to sit up doubles the pain — he cannot tolerate a seated position.', source: 'exam' },
    back: { text: 'No spinal tenderness.', source: 'exam' },
    extremities: { text: 'Right hip painful with movement; no obvious deformity; distal pulses intact.', source: 'exam' },
    neuro: { text: 'Moves all extremities, grips equal, no facial droop.', source: 'exam' },
    respiratory: { text: 'Lungs clear bilaterally.', source: 'exam' },
    cardiac: { text: 'Irregularly irregular pulse.', source: 'exam' },
  },
  glucose: { text: '112 mg/dL.', source: 'device' },
  monitorRhythm: { text: 'Atrial fibrillation, rate ~90–110; no acute ST changes seen.', source: 'device' },
  twelveLead: { text: 'Atrial fibrillation with rapid ventricular response; no ST-elevation MI.', source: 'device' },
  deteriorationAtSecond: 240,
  deteriorationNote: 'Patient is more lightheaded; skin is cooler and he looks worse than a few minutes ago.',
};
