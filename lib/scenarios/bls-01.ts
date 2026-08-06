import type { ActionDefinition, EventDefinition, ScenarioDefinition, SceneState } from '../engine/types';
import { requestResource } from '../engine/resources';
import { updateDifferential } from '../engine/differential';
import { raiseCriticalFlag } from '../engine/scoring';

/**
 * "Second Floor, No Elevator" — a residential fall where the real
 * problem is getting three flights down safely with the manpower and
 * equipment you actually brought or called for, not diagnosing him.
 * Deliberately built so there is more than one reasonable plan: early
 * resource requests and late-but-adaptive ones can both end well; only
 * attempting an unassisted carry after he's genuinely too weak to help
 * himself is the critical failure.
 */

const familyAddressed = (s: SceneState) =>
  s.actionsTaken.includes('calm_family_member') || s.actionsTaken.includes('direct_family_to_step_back');

const differentialChosen = (s: SceneState) =>
  s.actionsTaken.includes('differential_trauma_only') ||
  s.actionsTaken.includes('differential_possible_medical_cause') ||
  s.actionsTaken.includes('differential_unclear');

const commotionHandled = (s: SceneState) =>
  s.actionsTaken.includes('delegate_downstairs_commotion') || s.actionsTaken.includes('personally_check_commotion');

const extraHandsOnScene = (s: SceneState) =>
  s.resources.additional_ems.status === 'on_scene' || s.resources.fire_lift_assist.status === 'on_scene';

const actions: readonly ActionDefinition[] = [
  {
    id: 'request_additional_ems',
    label: 'Request an additional EMS unit',
    availableWhen: (s) => s.resources.additional_ems.status === 'not_requested',
    timeCostMinutes: 1,
    apply: (s) => requestResource(s, 'additional_ems', 9),
    observe: (s) => {
      const at = s.resources.additional_ems.requestedAtMinute ?? 0;
      return at <= 6
        ? [{
            category: 'resource_management', severity: 'positive', tag: 'situational_awareness',
            note: 'requested additional EMS early', atMinute: at,
            learnerNarrative: 'Calling for a second crew before you needed them meant the extra hands actually arrived in time to help.',
          }]
        : [{
            category: 'resource_management', severity: 'notable',
            note: 'requested additional EMS late', atMinute: at,
            learnerNarrative: 'By the time you called for a second crew, the moment where it would have helped most had already passed.',
          }];
    },
  },
  {
    id: 'request_fire_lift_assist',
    label: 'Request fire department lift assist',
    availableWhen: (s) => s.resources.fire_lift_assist.status === 'not_requested',
    timeCostMinutes: 1,
    apply: (s) => requestResource(s, 'fire_lift_assist', 7),
    observe: (s) => {
      const at = s.resources.fire_lift_assist.requestedAtMinute ?? 0;
      return at <= 6
        ? [{
            category: 'resource_management', severity: 'positive', tag: 'situational_awareness',
            note: 'requested fire lift assist early', atMinute: at,
            learnerNarrative: 'Calling for lift assist before you needed it meant it was already close by once the stairwell turned out to be a problem.',
          }]
        : [{
            category: 'resource_management', severity: 'notable',
            note: 'requested fire lift assist late', atMinute: at,
            learnerNarrative: 'Lift assist wasn\u2019t called until the situation had already gotten harder than it needed to.',
          }];
    },
  },
  {
    id: 'brief_partner_at_dispatch',
    label: 'Brief your partner on the plan before you roll',
    availableWhen: (s) => s.phase === 'dispatch',
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => s,
    observe: (s) => [{
      category: 'communication', severity: 'positive', tag: 'crew_resource_management',
      note: 'briefed partner before rolling', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Talking through the plan with your partner before you even left meant you rolled up already coordinated.',
    }],
  },
  {
    id: 'prep_stair_chair',
    label: 'Grab the stair chair instead of the stretcher',
    availableWhen: (s) => (s.phase === 'dispatch' || s.phase === 'en_route' || s.phase === 'arrival') && !s.stairChairPrepped,
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => ({ ...s, stairChairPrepped: true }),
    observe: (s) => [{
      category: 'resource_management', severity: 'positive', tag: 'situational_awareness',
      note: 'prepped stair chair ahead of need', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Grabbing the stair chair before you needed it meant you weren\u2019t improvising once you saw the stairwell.',
    }],
  },
  {
    id: 'respond_to_call',
    label: 'Respond to the call',
    availableWhen: (s) => s.phase === 'dispatch',
    timeCostMinutes: 6,
    apply: (s) => ({
      ...s,
      phase: 'arrival',
      familyState: 'agitated',
      hazardFlags: ['Narrow street \u2014 limited ambulance positioning options'],
    }),
  },
  {
    id: 'continue_driving',
    label: 'Continue toward the scene',
    availableWhen: (s) => s.phase === 'en_route',
    timeCostMinutes: 2,
    apply: (s) => s,
  },
  {
    id: 'position_ambulance_close',
    label: 'Park directly in front, blocking the lane',
    availableWhen: (s) => s.phase === 'arrival' && s.ambulancePosition === undefined,
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => ({ ...s, ambulancePosition: 'blocking_lane' }),
    observe: (s) => [{
      category: 'scene_safety', severity: 'minor',
      note: 'blocked the lane for a faster approach', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Parking right in front got you inside faster, but it left the lane blocked \u2014 worth weighing against loading the patient back out later.',
    }],
  },
  {
    id: 'position_ambulance_clear',
    label: 'Park up the block in a clear spot',
    availableWhen: (s) => s.phase === 'arrival' && s.ambulancePosition === undefined,
    timeCostMinutes: 2,
    oneTime: true,
    apply: (s) => ({ ...s, ambulancePosition: 'clear_spot' }),
    observe: (s) => [{
      category: 'scene_safety', severity: 'positive', tag: 'situational_awareness',
      note: 'kept ambulance unobstructed for later load', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Taking the extra steps in now meant the truck wasn\u2019t boxed in when it came time to load the patient.',
    }],
  },
  {
    id: 'calm_family_member',
    label: 'Calmly ask the son what happened and reassure him',
    availableWhen: (s) => s.phase === 'arrival' && s.familyState === 'agitated' && !familyAddressed(s),
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => ({ ...s, familyState: 'calm' }),
    observe: (s) => [{
      category: 'communication', severity: 'positive', tag: 'emotional_intelligence',
      note: 'de-escalated family, got a clearer account', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Taking a moment to calm him down meant you actually got a clear account instead of just noise.',
    }],
  },
  {
    id: 'direct_family_to_step_back',
    label: 'Firmly tell him to step back so you can work',
    availableWhen: (s) => s.phase === 'arrival' && s.familyState === 'agitated' && !familyAddressed(s),
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => s,
    observe: (s) => [{
      category: 'communication', severity: 'notable', tag: 'professionalism',
      note: 'dismissed family, missed their information', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Brushing him off got him out of the way, but he had information you needed \u2014 you just didn\u2019t get to hear it.',
    }],
  },
  {
    id: 'check_stairwell_safety',
    label: 'Check the stairwell for hazards before heading up',
    availableWhen: (s) => s.phase === 'arrival' && !s.actionsTaken.includes('check_stairwell_safety'),
    timeCostMinutes: 1,
    oneTime: true,
    apply: (s) => ({ ...s, hazardFlags: [...s.hazardFlags, 'Stairwell checked \u2014 clutter near the second landing, otherwise clear'] }),
    observe: (s) => [{
      category: 'scene_safety', severity: 'positive', tag: 'scene_safety',
      note: 'checked stairwell before committing', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Checking the stairwell before committing meant clutter or a loose railing wouldn\u2019t have caught you off guard.',
    }],
  },
  {
    id: 'differential_trauma_only',
    label: 'Note this as a mechanical fall \u2014 no other cause suspected',
    availableWhen: (s) => s.phase === 'arrival' && familyAddressed(s) && !differentialChosen(s),
    timeCostMinutes: 1,
    apply: (s) => updateDifferential(s, ['mechanical_fall_only'], 'family account: dizziness beforehand not weighed'),
    observe: (s) => [{
      category: 'differential_accuracy', severity: 'notable', tag: 'differential_thinking',
      note: 'treated as trauma-only despite dizziness report', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Sticking with \u201cjust a fall\u201d meant the dizziness he mentioned beforehand didn\u2019t factor into your plan at all.',
    }],
  },
  {
    id: 'differential_possible_medical_cause',
    label: 'Note this as a possible medical event that caused the fall',
    availableWhen: (s) => s.phase === 'arrival' && familyAddressed(s) && !differentialChosen(s),
    timeCostMinutes: 1,
    apply: (s) => updateDifferential(s, ['possible_medical_event_caused_fall'], 'family: dizziness before he went down'),
    observe: (s) => [{
      category: 'differential_accuracy', severity: 'positive', tag: 'differential_thinking',
      note: 'recognized possible medical cause of fall', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Recognizing the dizziness might have caused the fall \u2014 not just resulted from it \u2014 kept your plan honest about what you didn\u2019t know yet.',
    }],
  },
  {
    id: 'differential_unclear',
    label: 'Note the cause as unclear, pending more information',
    availableWhen: (s) => s.phase === 'arrival' && familyAddressed(s) && !differentialChosen(s),
    timeCostMinutes: 1,
    apply: (s) => updateDifferential(s, ['unclear_needs_more_info'], 'family account inconclusive'),
    observe: (s) => [{
      category: 'differential_accuracy', severity: 'positive', tag: 'differential_thinking',
      note: 'left differential open rather than guessing', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Leaving it open rather than guessing kept you from anchoring on an answer you didn\u2019t actually have yet.',
    }],
  },
  {
    id: 'wait_and_monitor',
    label: 'Wait and monitor the situation',
    availableWhen: (s) => s.phase === 'arrival' || s.phase === 'assessment',
    timeCostMinutes: 2,
    apply: (s) => s,
  },
  {
    id: 'approach_patient',
    label: 'Head upstairs to reach the patient',
    availableWhen: (s) =>
      s.phase === 'arrival' && s.ambulancePosition !== undefined && familyAddressed(s) && differentialChosen(s),
    timeCostMinutes: 2,
    apply: (s) => ({ ...s, phase: 'assessment' }),
  },
  {
    id: 'delegate_downstairs_commotion',
    label: 'Ask your partner or dispatch to handle a commotion downstairs while you stay with the patient',
    availableWhen: (s) => s.phase === 'assessment' && !commotionHandled(s),
    timeCostMinutes: 1,
    apply: (s) => s,
    observe: (s) => [{
      category: 'prioritization', severity: 'positive', tag: 'leadership',
      note: 'delegated distraction, stayed with patient', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Staying with your patient and delegating the distraction kept your attention where it needed to be.',
    }],
  },
  {
    id: 'personally_check_commotion',
    label: 'Go down to check on the commotion yourself',
    availableWhen: (s) => s.phase === 'assessment' && !commotionHandled(s),
    timeCostMinutes: 3,
    apply: (s) => s,
    observe: (s) => [{
      category: 'prioritization', severity: 'notable', tag: 'leadership',
      note: 'left patient to personally handle a delegable distraction', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Leaving your patient to handle a distraction yourself cost time you didn\u2019t get back, for something that didn\u2019t need you personally.',
    }],
  },
  {
    id: 'move_patient_with_help',
    label: 'Move the patient down using the stair chair with the extra hands on scene',
    availableWhen: (s) => s.phase === 'assessment' && extraHandsOnScene(s),
    timeCostMinutes: 4,
    apply: (s) => ({ ...s, phase: 'resolution' }),
    observe: (s) => [{
      category: 'mission_completion', severity: 'positive', tag: 'crew_resource_management',
      note: 'moved patient safely with adequate resources', atMinute: s.elapsedMinutes,
      learnerNarrative: 'With enough hands actually on scene, the move down was controlled and safe.',
    }],
  },
  {
    id: 'move_patient_alone_cautiously',
    label: 'Move the patient down carefully with just the two of you and the stair chair',
    availableWhen: (s) => s.phase === 'assessment' && !extraHandsOnScene(s) && s.patientCanBearWeight,
    timeCostMinutes: 6,
    apply: (s) => ({ ...s, phase: 'resolution' }),
    observe: (s) => [{
      category: 'mission_completion', severity: 'positive', tag: 'differential_thinking',
      note: 'judged extra hands unnecessary while patient could still assist', atMinute: s.elapsedMinutes,
      learnerNarrative: 'He could still help himself, and the stair chair was enough \u2014 not every extrication needs a bigger crew.',
    }],
  },
  {
    id: 'attempt_carry_unsafely',
    label: 'Carry him down yourselves right now, hands or not',
    availableWhen: (s) => s.phase === 'assessment' && !extraHandsOnScene(s) && !s.patientCanBearWeight,
    timeCostMinutes: 5,
    apply: (s) =>
      raiseCriticalFlag(
        { ...s, phase: 'resolution' },
        {
          id: 'unsafe_carry',
          whatHappened:
            'You and your partner carried him down three flights without the stair chair fully securing him and without waiting for the extra hands you didn\u2019t have, after he\u2019d already become too weak to assist himself.',
          whyDangerous:
            'Two providers attempting an unassisted carry of a patient who can no longer bear his own weight, on a stairwell, is a serious fall and injury risk to the patient and to both of you.',
          consequence: 'The move was unstable for several steps. It worked this time, but it was genuinely unsafe.',
          saferAlternative:
            'Waiting the few remaining minutes for hands you could have requested earlier \u2014 or the moment he weakened \u2014 would have made this a controlled move instead of an improvised one.',
        },
      ),
    observe: (s) => [{
      category: 'scene_safety', severity: 'critical', tag: 'patient_advocacy',
      note: 'attempted unassisted carry after patient could no longer bear weight', atMinute: s.elapsedMinutes,
    }],
  },
  {
    id: 'initiate_transport',
    label: 'Load the patient and initiate transport',
    availableWhen: (s) => s.phase === 'resolution',
    timeCostMinutes: 3,
    apply: (s) => ({
      ...s,
      phase: 'complete',
      completion: {
        status: s.criticalFlags.length > 0 ? 'unsafe_extrication_completed' : 'transport_initiated',
        atMinute: s.elapsedMinutes,
      },
    }),
  },
];

const events: readonly EventDefinition[] = [
  {
    id: 'cad_update_patient_sitting_up',
    trigger: { type: 'time', atMinute: 3 },
    critical: false,
    label: 'Dispatch update',
    detail: 'An additional caller confirms the same address \u2014 the patient is reportedly sitting up now, still conscious.',
    apply: (s) => s,
  },
  {
    id: 'patient_weakens_no_help',
    trigger: { type: 'missed_decision', deadlineMinute: 16, check: (s) => !extraHandsOnScene(s) },
    critical: true,
    label: 'He\u2019s grown too weak to help move himself',
    detail: 'He can no longer meaningfully assist \u2014 whatever move happens next, it has to account for that.',
    apply: (s) => ({ ...s, patientCanBearWeight: false }),
    observe: (s) => [{
      category: 'adaptability', severity: 'notable', tag: 'situational_awareness',
      note: 'complication landed with no extra resource on scene yet', atMinute: s.elapsedMinutes,
      learnerNarrative: 'By the time the extra hands were really needed, nobody had arrived \u2014 what you do next is what actually counts now.',
    }],
  },
  {
    id: 'patient_weakens_help_present',
    trigger: {
      type: 'condition',
      check: (s) => s.elapsedMinutes >= 16 && extraHandsOnScene(s) && !s.firedEventIds.includes('patient_weakens_no_help'),
    },
    critical: false,
    label: 'He\u2019s grown more tired, but you already have the hands you need',
    detail: 'He can no longer assist much \u2014 fortunately, the extra hands you called for are already here.',
    apply: (s) => ({ ...s, patientCanBearWeight: false }),
    observe: (s) => [{
      category: 'resource_management', severity: 'positive', tag: 'situational_awareness',
      note: 'complication landed with resources already on scene', atMinute: s.elapsedMinutes,
      learnerNarrative: 'Because the extra hands were already on scene, him getting more tired didn\u2019t turn into a scramble.',
    }],
  },
];

function buildInitialState(): SceneState {
  return {
    phase: 'dispatch',
    elapsedMinutes: 0,
    resources: {
      additional_ems: { kind: 'additional_ems', status: 'not_requested' },
      fire_lift_assist: { kind: 'fire_lift_assist', status: 'not_requested' },
    },
    hazardFlags: [],
    familyState: 'calm',
    stairChairPrepped: false,
    patientCanBearWeight: true,
    differential: { current: [], history: [] },
    timeline: [],
    criticalFlags: [],
    actionsTaken: [],
    firedEventIds: [],
    dynamicEvents: [],
  };
}

export const bls01: ScenarioDefinition = {
  id: 'bls-01',
  title: 'Second Floor, No Elevator',
  dispatchSummary:
    'Residential fall. Caller is a neighbor, not on scene: "I heard him fall, he says he\u2019s okay, no loss of consciousness that I know of." Third-floor walkup, no elevator.',
  buildInitialState,
  actions,
  events,
  isComplete: (s) => s.phase === 'complete',
  relevantBehavioralTags: [
    'scene_safety',
    'situational_awareness',
    'communication',
    'leadership',
    'differential_thinking',
    'crew_resource_management',
    'emotional_intelligence',
    'professionalism',
    'patient_advocacy',
  ],
};

/** Scene narrative text for the learner UI, centralized here since it's scenario content, not engine logic. */
export function getSceneNarrative(state: SceneState): string {
  switch (state.phase) {
    case 'dispatch':
      return bls01.dispatchSummary;
    case 'en_route':
      return 'En route. Six minutes out per the MDT.';
    case 'arrival':
      return state.familyState === 'agitated'
        ? 'You arrive at a narrow three-story walkup. A man in his 30s meets you at the base of the stairs, talking fast: "He\u2019s fine, he just needs help standing, why is this taking so long?"'
        : 'The son has calmed down. He tells you his father mentioned feeling dizzy right before he went down \u2014 he didn\u2019t actually see the fall happen, he was in the next room.';
    case 'assessment':
      // The patient is INSIDE his apartment, not on the landing. His own TV is
      // still on from before he fell, and the door stands open because the son
      // came down to meet the crew and didn't shut it behind him.
      return 'Inside the apartment \u2014 the door was standing open (the son left it that way coming down to meet you), and his TV is still going from before he fell. He\u2019s on the living-room floor: alert, oriented, in pain, and reluctant to put weight on one leg. The stairwell behind you is narrow.';
    case 'resolution':
      return 'He\u2019s at the bottom of the stairs, on the stair chair, ready for the ambulance.';
    case 'complete':
      return 'Mission complete.';
    default:
      return '';
  }
}
