import { describe, it, expect } from 'vitest';
import {
  REFLECTION_QUESTIONS,
  FEEDBACK_QUESTIONS,
  REQUIRED_REFLECTION_IDS,
  reflectionComplete,
} from './reflection';

describe('reflection & feedback questions (§23, §24)', () => {
  it('uses the approved reflection and feedback question sets', () => {
    expect(REFLECTION_QUESTIONS.length).toBeGreaterThanOrEqual(15);
    expect(FEEDBACK_QUESTIONS.length).toBe(8);
    expect(REFLECTION_QUESTIONS[0].prompt).toMatch(/how do you think you managed this call/i);
    expect(FEEDBACK_QUESTIONS[0].prompt).toMatch(/what did you like about this scenario/i);
  });

  it('requires only the brief-required items to proceed', () => {
    expect(REQUIRED_REFLECTION_IDS.length).toBeGreaterThan(0);
    expect(reflectionComplete({})).toBe(false);
    const answers = Object.fromEntries(REQUIRED_REFLECTION_IDS.map((id) => [id, 'a thoughtful note']));
    expect(reflectionComplete(answers)).toBe(true);
  });
});
