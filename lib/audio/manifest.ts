/**
 * Typed, replaceable audio manifest (§ Step 11). One central source of truth
 * for every audio event: its channel, whether it loops, its default volume,
 * caption + source, clinical/equipment gating, and — for EVERY entry — an
 * explicit placeholder + licensing status. Nothing here is a final licensed
 * asset; all are synthesized/silent placeholders to be replaced later.
 */

export type AudioChannel =
  | 'partner_ron'
  | 'dispatch_radio'
  | 'emergency_warning'
  | 'scene_patient'
  | 'medical_equipment';

export const AUDIO_CHANNELS: readonly AudioChannel[] = [
  'partner_ron',
  'dispatch_radio',
  'emergency_warning',
  'scene_patient',
  'medical_equipment',
];

export const CHANNEL_LABELS: Record<AudioChannel, string> = {
  partner_ron: 'Partner Ron',
  dispatch_radio: 'Dispatch & radio',
  emergency_warning: 'Emergency warning',
  scene_patient: 'Scene & patient',
  medical_equipment: 'Medical equipment',
};

/** Caption source labels (§ captions). */
export type CaptionSource =
  | 'Dispatch'
  | 'Partner Ron'
  | 'Fire Officer'
  | 'Patient'
  | 'Family'
  | 'Bystander'
  | 'Police'
  | 'Monitor'
  | 'Scene Audio';

/** How a placeholder is produced without any third-party asset. */
export type Generator = 'tone' | 'noise' | 'silence';

/** A gate that must be satisfied before this audio may play (§ clinical gating). */
export type AudioGate =
  | { readonly kind: 'none' }
  | { readonly kind: 'clinical_action'; readonly actionId: string }
  | { readonly kind: 'equipment'; readonly equipmentId: string };

export interface AudioAsset {
  readonly id: string;
  readonly channel: AudioChannel;
  readonly kind: 'oneshot' | 'loop';
  readonly generator: Generator;
  readonly looping: boolean;
  readonly defaultVolume: number;
  readonly caption: string;
  readonly captionSource: CaptionSource;
  readonly durationMs?: number;
  /** Essential audio is preserved in Reduced Sensory Mode; nonessential is lowered. */
  readonly essential: boolean;
  readonly gate: AudioGate;
  readonly replacementStatus: 'placeholder';
  readonly licensingStatus: 'placeholder';
  readonly notes: string;
}

export const PLACEHOLDER_NOTE =
  'Placeholder — replace with approved royalty-free, commissioned, or internally recorded production audio.';

type AssetInput = Omit<AudioAsset, 'replacementStatus' | 'licensingStatus' | 'notes' | 'looping' | 'gate'> &
  Partial<Pick<AudioAsset, 'gate' | 'notes'>>;

function asset(a: AssetInput): AudioAsset {
  return {
    ...a,
    looping: a.kind === 'loop',
    gate: a.gate ?? { kind: 'none' },
    replacementStatus: 'placeholder',
    licensingStatus: 'placeholder',
    notes: a.notes ?? PLACEHOLDER_NOTE,
  };
}

const ENTRIES: AudioAsset[] = [
  // ---- Dispatch & response ----
  asset({ id: 'dispatch_alert', channel: 'dispatch_radio', kind: 'oneshot', generator: 'tone', defaultVolume: 0.8, caption: 'Dispatch alert tone', captionSource: 'Dispatch', durationMs: 3000, essential: true }),
  asset({ id: 'radio_squelch', channel: 'dispatch_radio', kind: 'oneshot', generator: 'noise', defaultVolume: 0.5, caption: 'Radio squelch', captionSource: 'Dispatch', durationMs: 400, essential: true }),
  asset({ id: 'mic_click', channel: 'dispatch_radio', kind: 'oneshot', generator: 'tone', defaultVolume: 0.4, caption: 'Mic click', captionSource: 'Dispatch', durationMs: 150, essential: false }),
  asset({ id: 'dispatcher_voice', channel: 'dispatch_radio', kind: 'oneshot', generator: 'silence', defaultVolume: 0.9, caption: 'Dispatcher: response assignment', captionSource: 'Dispatch', durationMs: 4000, essential: true, notes: `${PLACEHOLDER_NOTE} Silent + captioned until a recorded dispatcher voice exists.` }),
  asset({ id: 'siren_approach', channel: 'emergency_warning', kind: 'oneshot', generator: 'tone', defaultVolume: 0.7, caption: 'Siren approaching', captionSource: 'Scene Audio', durationMs: 3000, essential: true }),
  asset({ id: 'siren_wind_down', channel: 'emergency_warning', kind: 'oneshot', generator: 'tone', defaultVolume: 0.6, caption: 'Siren winding down', captionSource: 'Scene Audio', durationMs: 2000, essential: true }),
  asset({ id: 'air_brakes', channel: 'scene_patient', kind: 'oneshot', generator: 'noise', defaultVolume: 0.6, caption: 'Air brakes hiss', captionSource: 'Scene Audio', durationMs: 1200, essential: false }),
  asset({ id: 'engine_idle', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.35, caption: 'Fire engine idling', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'ambulance_cab', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.3, caption: 'Ambulance cab ambience', captionSource: 'Scene Audio', essential: false }),

  // ---- Partner Ron (placeholder speech; captioned) ----
  ...([
    ['ron_ready_roll', 'Medic 3 is ready to roll! Let’s get available!'],
    ['ron_equipment_q', 'Based on what you’re thinking, what equipment do you want to take in?'],
    ['ron_engine_here', 'Engine’s here—here they come!'],
    ['ron_scene_lights', 'Want the scene lights on?'],
    ['ron_ballistic', 'This is a shooting scene. Do you want our vests and helmets on?'],
    ['ron_resource', 'Do we need more help? Who do you want?'],
    ['ron_dynamics', 'That family member is starting to interfere.'],
    ['ron_ack', 'Got it.'],
  ] as const).map(([id, line]) =>
    asset({ id, channel: 'partner_ron', kind: 'oneshot', generator: 'silence', defaultVolume: 1, caption: line, captionSource: 'Partner Ron', durationMs: 2500, essential: true, notes: `${PLACEHOLDER_NOTE} Silent + captioned until a recorded Partner Ron voice exists.` }),
  ),
  asset({ id: 'fire_officer_offer', channel: 'partner_ron', kind: 'oneshot', generator: 'silence', defaultVolume: 1, caption: 'Medic 3, what can we do to help?', captionSource: 'Fire Officer', durationMs: 2500, essential: true, notes: `${PLACEHOLDER_NOTE} Silent + captioned until a recorded fire-officer voice exists.` }),

  // ---- Scene environment (loops, nonessential) ----
  asset({ id: 'rain', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.3, caption: 'Rain', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'wind', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.25, caption: 'Wind', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'traffic', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.3, caption: 'Traffic', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'crowd', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.3, caption: 'Crowd noise', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'television', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.3, caption: 'Television', captionSource: 'Scene Audio', essential: false }),
  asset({ id: 'animal', channel: 'scene_patient', kind: 'oneshot', generator: 'tone', defaultVolume: 0.4, caption: 'Dog barking', captionSource: 'Scene Audio', durationMs: 800, essential: false }),
  asset({ id: 'police_radio', channel: 'scene_patient', kind: 'oneshot', generator: 'noise', defaultVolume: 0.4, caption: 'Police radio traffic', captionSource: 'Police', durationMs: 1500, essential: false }),
  asset({ id: 'scene_background', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.2, caption: 'Scene background', captionSource: 'Scene Audio', essential: false }),

  // ---- Patient & behavioral (scenario-configured; sourced captions) ----
  asset({ id: 'labored_breathing', channel: 'scene_patient', kind: 'loop', generator: 'noise', defaultVolume: 0.4, caption: 'Patient: labored breathing', captionSource: 'Patient', essential: false }),
  asset({ id: 'coughing', channel: 'scene_patient', kind: 'oneshot', generator: 'noise', defaultVolume: 0.4, caption: 'Patient: coughing', captionSource: 'Patient', durationMs: 900, essential: false }),
  asset({ id: 'groaning', channel: 'scene_patient', kind: 'oneshot', generator: 'tone', defaultVolume: 0.4, caption: 'Patient: groaning', captionSource: 'Patient', durationMs: 1200, essential: false }),
  asset({ id: 'crying', channel: 'scene_patient', kind: 'oneshot', generator: 'tone', defaultVolume: 0.35, caption: 'Family: crying', captionSource: 'Family', durationMs: 1500, essential: false }),
  asset({ id: 'family_interrupt', channel: 'scene_patient', kind: 'oneshot', generator: 'silence', defaultVolume: 0.6, caption: 'Family: interrupting', captionSource: 'Family', durationMs: 2000, essential: false }),
  asset({ id: 'bystander_dialogue', channel: 'scene_patient', kind: 'oneshot', generator: 'silence', defaultVolume: 0.5, caption: 'Bystander: comment', captionSource: 'Bystander', durationMs: 2000, essential: false }),
  asset({ id: 'angry_speech', channel: 'scene_patient', kind: 'oneshot', generator: 'silence', defaultVolume: 0.6, caption: 'Patient: frustrated', captionSource: 'Patient', durationMs: 2000, essential: false }),

  // ---- Medical equipment (gated) ----
  asset({ id: 'monitor_startup', channel: 'medical_equipment', kind: 'oneshot', generator: 'tone', defaultVolume: 0.5, caption: 'Monitor startup', captionSource: 'Monitor', durationMs: 1500, essential: false, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'ecg_tone', channel: 'medical_equipment', kind: 'loop', generator: 'tone', defaultVolume: 0.4, caption: 'Monitor: ECG tone', captionSource: 'Monitor', essential: false, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'pulse_ox_tone', channel: 'medical_equipment', kind: 'loop', generator: 'tone', defaultVolume: 0.35, caption: 'Monitor: pulse-ox tone', captionSource: 'Monitor', essential: false, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'twelve_lead_tone', channel: 'medical_equipment', kind: 'oneshot', generator: 'tone', defaultVolume: 0.4, caption: 'Monitor: 12-lead acquired', captionSource: 'Monitor', durationMs: 1000, essential: false, gate: { kind: 'clinical_action', actionId: 'obtain_12_lead' } }),
  asset({ id: 'bp_cuff', channel: 'medical_equipment', kind: 'oneshot', generator: 'noise', defaultVolume: 0.4, caption: 'Blood-pressure cuff', captionSource: 'Monitor', durationMs: 3000, essential: false, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'defib_charging', channel: 'medical_equipment', kind: 'oneshot', generator: 'tone', defaultVolume: 0.6, caption: 'Defibrillator charging', captionSource: 'Monitor', durationMs: 3000, essential: true, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'shock_ready', channel: 'medical_equipment', kind: 'oneshot', generator: 'tone', defaultVolume: 0.7, caption: 'Shock ready', captionSource: 'Monitor', durationMs: 1500, essential: true, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'pacing_cue', channel: 'medical_equipment', kind: 'loop', generator: 'tone', defaultVolume: 0.5, caption: 'External pacing', captionSource: 'Monitor', essential: true, gate: { kind: 'clinical_action', actionId: 'apply_monitor' } }),
  asset({ id: 'suction', channel: 'medical_equipment', kind: 'loop', generator: 'noise', defaultVolume: 0.5, caption: 'Portable suction', captionSource: 'Scene Audio', essential: false, gate: { kind: 'equipment', equipmentId: 'portable_suction' } }),
  asset({ id: 'oxygen_flow', channel: 'medical_equipment', kind: 'loop', generator: 'noise', defaultVolume: 0.35, caption: 'Oxygen flow', captionSource: 'Scene Audio', essential: false, gate: { kind: 'equipment', equipmentId: 'airway_bag' } }),
  asset({ id: 'iv_pump_alarm', channel: 'medical_equipment', kind: 'oneshot', generator: 'tone', defaultVolume: 0.6, caption: 'IV pump alarm', captionSource: 'Monitor', durationMs: 1500, essential: true, gate: { kind: 'equipment', equipmentId: 'iv_pump' } }),
  asset({ id: 'stretcher_move', channel: 'scene_patient', kind: 'oneshot', generator: 'noise', defaultVolume: 0.4, caption: 'Stretcher movement', captionSource: 'Scene Audio', durationMs: 2000, essential: false }),
];

export const AUDIO_MANIFEST: Readonly<Record<string, AudioAsset>> = Object.fromEntries(ENTRIES.map((e) => [e.id, e]));

export type AudioEventId = string;

export function audioAsset(id: string): AudioAsset | undefined {
  return AUDIO_MANIFEST[id];
}
