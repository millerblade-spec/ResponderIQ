/**
 * Learner reflection (§23) and simulator feedback (§24) questions — approved
 * wording, typed. A mix of scaled, yes/no, selection, optional and brief-
 * required responses so no item forces a long essay. Reflection is asked FIRST,
 * before feedback and before any ResponderIQ analysis.
 */

export type ReflectionResponseType = 'scale' | 'yesno' | 'select' | 'text' | 'required_text';

export interface ReflectionQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly type: ReflectionResponseType;
  readonly options?: readonly string[];
}

/** §23 — learner self-assessment, asked before feedback. */
export const REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = [
  { id: 'managed', prompt: 'How do you think you managed this call?', type: 'scale' },
  { id: 'went_well', prompt: 'What do you believe went well?', type: 'required_text' },
  { id: 'most_difficult', prompt: 'What was the most difficult part?', type: 'text' },
  { id: 'do_differently', prompt: 'What would you do differently if you ran this call again?', type: 'text' },
  { id: 'enough_info', prompt: 'Did you have enough information to make your decisions?', type: 'yesno' },
  { id: 'additional_info', prompt: 'What additional information did you feel you needed?', type: 'text' },
  { id: 'hazards_identified', prompt: 'What hazards or distractions did you identify?', type: 'text' },
  { id: 'hazards_managed', prompt: 'How did you manage those hazards or distractions?', type: 'text' },
  { id: 'noticed_not_addressed', prompt: 'Was there anything you noticed but did not address?', type: 'text' },
  { id: 'used_resources', prompt: 'How effectively did you use Partner Ron, fire personnel, and other resources?', type: 'scale' },
  { id: 'awaiting_unused', prompt: 'Was anyone left Awaiting Assignment who could have helped?', type: 'yesno' },
  { id: 'differentials_equipment', prompt: 'How did your initial differentials affect the equipment you brought?', type: 'text' },
  { id: 'differentials_changed', prompt: 'Did your differential priorities change after patient contact?', type: 'yesno' },
  { id: 'patient_impression', prompt: 'What did you believe was happening with the patient by the end?', type: 'required_text' },
  { id: 'key_finding', prompt: 'Which finding most influenced your working impression?', type: 'text' },
  { id: 'missing_equipment', prompt: 'Did you need equipment that you failed to bring initially?', type: 'yesno' },
  { id: 'change_next_time', prompt: 'What would you change next time?', type: 'text' },
];

/** §24 — feedback about ResponderIQ, asked after reflection. */
export const FEEDBACK_QUESTIONS: readonly ReflectionQuestion[] = [
  { id: 'liked', prompt: 'What did you like about this scenario?', type: 'text' },
  { id: 'disliked', prompt: 'What did you dislike or find frustrating?', type: 'text' },
  { id: 'confusing', prompt: 'Was anything confusing, unrealistic, or difficult to use?', type: 'text' },
  { id: 'missing_controls', prompt: 'What information or controls did you feel were missing?', type: 'text' },
  { id: 'improve', prompt: 'What would you change if you could improve the scenario?', type: 'text' },
  { id: 'liked_using', prompt: 'Did you like using ResponderIQ?', type: 'scale' },
  { id: 'would_use_again', prompt: 'Would you use it again for training?', type: 'yesno' },
  { id: 'anything_else', prompt: 'Is there anything else the ResponderIQ team should know?', type: 'text' },
];

export type ReflectionResponses = Readonly<Record<string, string | number>>;

/** The brief-required reflection items that must be answered before proceeding (§23). */
export const REQUIRED_REFLECTION_IDS: readonly string[] = REFLECTION_QUESTIONS.filter(
  (q) => q.type === 'required_text',
).map((q) => q.id);

export function reflectionComplete(responses: ReflectionResponses): boolean {
  return REQUIRED_REFLECTION_IDS.every((id) => {
    const v = responses[id];
    return typeof v === 'string' && v.trim().length > 0;
  });
}
