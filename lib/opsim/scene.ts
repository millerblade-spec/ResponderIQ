/**
 * Scene-safety data (§15–§19): the windshield-assessment factor library, the
 * per-scenario scene configuration, and the scene-lighting / ballistic-PPE
 * option sets. Kept as typed data so scenarios compose a scene rather than the
 * components hard-coding one.
 *
 * Threats are described by visible behavior, weapons, credible reports, and
 * observable conditions — never by appearance, clothing, race, or neighborhood
 * (§15).
 */

export type WindshieldCategory =
  | 'lighting_weather'
  | 'road_access'
  | 'utility'
  | 'fire_hazmat'
  | 'behavioral_security';

export interface WindshieldFactor {
  readonly id: string;
  readonly category: WindshieldCategory;
  readonly label: string;
  /** Only visible once scene lights are on (§17) — otherwise hidden in low visibility. */
  readonly revealedByLight?: boolean;
}

export const WINDSHIELD_CATEGORY_LABELS: Record<WindshieldCategory, string> = {
  lighting_weather: 'Lighting & weather',
  road_access: 'Road & access hazards',
  utility: 'Utility hazards',
  fire_hazmat: 'Fire / hazardous-material threats',
  behavioral_security: 'Behavioral & security threats',
};

/** The full library of what could be seen from the unit (§15). A scenario references ids. */
export const WINDSHIELD_FACTOR_LIBRARY: readonly WindshieldFactor[] = [
  // lighting & weather
  ...(
    [
      'Day', 'Dusk', 'Night', 'Rain', 'Heavy rain', 'Fog', 'Wind', 'Snow', 'Ice',
      'Poor visibility', 'Extreme heat', 'Standing water', 'Flooding',
    ] as const
  ).map((label) => factor('lighting_weather', label)),
  // road & access (includes property-upkeep reads — a rough road, an unkempt
  // yard, and scattered debris are neglect indicators that feed "is this scene
  // safe", not just driving hazards)
  ...(
    [
      'Potholes', 'Mud', 'Broken glass', 'Debris', 'Blocked access', 'Narrow driveway',
      'Unsafe shoulder', 'Heavy traffic', 'Limited escape route', 'Poor unit positioning',
      'Unkempt lawn', 'Cans and litter in the yard',
    ] as const
  ).map((label) => factor('road_access', label)),
  // utility
  ...(
    [
      'Downed power lines', 'Arcing wires', 'Electrical lines near water', 'Damaged transformer',
      'Gas odor', 'Hissing utility line', 'Damaged utility pole',
    ] as const
  ).map((label) => factor('utility', label)),
  // fire / hazmat
  ...(
    [
      'Flames', 'Smoke', 'Fuel leak', 'Chemical containers', 'Unknown vapor', 'Vehicle fire',
      'Structure fire', 'Propane cylinders', 'Battery fire', 'Spilled fluids',
    ] as const
  ).map((label) => factor('fire_hazmat', label)),
  // behavioral & security
  ...(
    [
      'Visible weapons', 'Armed people', 'Fighting', 'Aggressive crowd', 'Person yelling or pacing',
      'Intoxicated bystanders', 'Uncontrolled animals', 'Someone blocking access',
      'Police actively searching', 'Bystanders surrounding the patient',
      'Group of people near the entrance',
    ] as const
  ).map((label) => factor('behavioral_security', label)),
];

function factor(category: WindshieldCategory, label: string): WindshieldFactor {
  return { id: labelToId(label), category, label };
}

function labelToId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function windshieldFactor(id: string): WindshieldFactor | undefined {
  return WINDSHIELD_FACTOR_LIBRARY.find((f) => f.id === id);
}

/** A scenario's scene, consumed by the scene-safety machine. */
export interface SceneConfig {
  /** Dispatch advised "Stage for law enforcement" (§16) — the learner cannot enter until cleared. */
  readonly dispatchStaging: boolean;
  /** A credible weapons/violence threat: drives police clearance and the ballistic-PPE prompt (§16, §18). */
  readonly securityThreat: boolean;
  /** Low visibility (dusk/dark/rain/fog/snow) — triggers the scene-lights prompt (§17). */
  readonly lowVisibility: boolean;
  /** Near a roadway — also motivates scene lights so traffic can see the crew (§17). */
  readonly nearRoadway: boolean;
  /** Conditions bad enough that Ron suggests rain/weather gear before stepping out (§18). */
  readonly weatherRequiresGear: boolean;
  /** Factor ids visible from the unit right now. */
  readonly presentFactorIds: readonly string[];
  /** Factor ids that only become visible once scene lights are on (§17). */
  readonly lightRevealedFactorIds?: readonly string[];
}

/** Scene-lighting choices offered when visibility is poor or near a roadway (§17). */
export const SCENE_LIGHT_OPTIONS = [
  { id: 'scene_lights_on', label: 'Turn scene lights on' },
  { id: 'reposition_staging', label: 'Reposition to staging first' },
  { id: 'apparatus_lighting', label: 'Request apparatus lighting' },
  { id: 'handheld_lighting', label: 'Use handheld lighting' },
  { id: 'lights_off', label: 'Leave scene lights off' },
] as const;
export type SceneLightChoice = (typeof SCENE_LIGHT_OPTIONS)[number]['id'];

/** Ballistic-PPE choices for a credible weapons threat (§18). */
export const BALLISTIC_PPE_OPTIONS = [
  { id: 'vests_and_helmets', label: 'Put on vests and helmets' },
  { id: 'vests_only', label: 'Put on vests only' },
  { id: 'remain_staged', label: 'Remain staged' },
  { id: 'request_le_status', label: 'Request updated law-enforcement status' },
  { id: 'no_ballistic', label: 'Do not use ballistic protection' },
] as const;
export type BallisticPpeChoice = (typeof BALLISTIC_PPE_OPTIONS)[number]['id'];

export const RON_SCENE_LINES = {
  windshield: 'Alright, partner. Before we get out—what do you see? Are we safe to enter?',
  sceneLightsDark: 'Partner, it’s pretty dark out here. Do you think we need to add scene lights?',
  sceneLightsRain:
    'It’s coming down pretty good. Want the scene lights on so we can see—and so they can see us?',
  weatherGear: 'It’s coming down pretty hard. Let’s get our rain gear and scene lights on before we step out.',
  ballistic: 'Partner, this is a shooting scene. Do you want our vests and helmets on?',
  clearedToEnter: 'Medic 3, the scene is secure. You’re clear to enter.',
  floorArrival:
    'Okay, this is his floor—take a quick read before we go in. How’s the light up here? And that door’s standing open.',
} as const;

export const SAFE_TO_ENTER = 'Safe to Enter';
export const NOT_SAFE_TO_ENTER = 'Not Safe to Enter — Stage';
export const REPOSITION_TO_STAGING = 'Reposition to Staging Location';
