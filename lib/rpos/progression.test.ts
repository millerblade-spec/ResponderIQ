import { describe, it, expect } from 'vitest';
import { consecutiveMastery, countsAsMastery, evaluateStanding } from './progression';
import { at, blueRun, failedHardStop, makeCase, makeEvidence, makeMiss } from './rpos.fixture';

describe('RPOS advancement', () => {
  // Level 3 isolates the streak rule: Level 1 additionally requires about ten
  // scenarios, which is exercised on its own further down.
  it('needs five consecutive BLUE cases', () => {
    const four = evaluateStanding(makeEvidence({ level: 3, cases: blueRun(4, { level: 3 }) }));
    expect(four.consecutiveBlue).toBe(4);
    expect(four.eligibleToAdvance).toBe(false);
    expect(four.blockers.map((b) => b.kind)).toContain('consecutive_blue');

    const five = evaluateStanding(makeEvidence({ level: 3, cases: blueRun(5, { level: 3 }) }));
    expect(five.consecutiveBlue).toBe(5);
    expect(five.eligibleToAdvance).toBe(true);
    expect(five.nextLevel).toBe(4);
  });

  it('counts the streak from the most recent case, so a later miss resets it', () => {
    const cases = [
      ...blueRun(4),
      makeCase({ score: 94, band: 'yellow', createdAt: at(5) }),
    ];
    expect(consecutiveMastery(cases)).toBe(0);
  });

  it('does not let a BLUE case with a critical error extend the streak', () => {
    const withCritical = makeCase({
      score: 99,
      band: 'blue',
      criticalErrors: ['Entered a scene under a staging order before it was cleared.'],
      createdAt: at(5),
    });
    expect(countsAsMastery(withCritical)).toBe(false);

    const standing = evaluateStanding(makeEvidence({ cases: [...blueRun(4), withCritical] }));
    expect(standing.consecutiveBlue).toBe(0);
    expect(standing.eligibleToAdvance).toBe(false);
    expect(standing.blockers.map((b) => b.kind)).toContain('critical_error');
  });

  it('does not let a BLUE case with a failed hard stop extend the streak', () => {
    const withHardStopMiss = makeCase({
      score: 100,
      band: 'blue',
      hardStops: [failedHardStop('dsi', ['Full 90-second paralysis countdown'])],
      createdAt: at(5),
    });
    expect(countsAsMastery(withHardStopMiss)).toBe(false);

    const standing = evaluateStanding(makeEvidence({ cases: [...blueRun(4), withHardStopMiss] }));
    expect(standing.eligibleToAdvance).toBe(false);
    expect(standing.blockers.map((b) => b.kind)).toContain('hard_stop');
    expect(standing.hardStopFailures.map((failure) => failure.id)).toEqual(['dsi']);
    // A perfect score does not erase it.
    expect(standing.bandCounts.blue).toBe(5);
  });

  it('blocks advancement on an unresolved critical Miss Board item even with five clean BLUE cases', () => {
    const standing = evaluateStanding(
      makeEvidence({
        level: 3,
        cases: blueRun(5, { level: 3 }),
        missBoard: [makeMiss({ subject: 'Scene safety', critical: true })],
      }),
    );
    expect(standing.consecutiveBlue).toBe(5);
    expect(standing.eligibleToAdvance).toBe(false);
    expect(standing.blockers.map((b) => b.kind)).toContain('unresolved_critical_miss');
  });

  it('does not block on a non-critical open miss', () => {
    const standing = evaluateStanding(
      makeEvidence({ level: 3, cases: blueRun(5, { level: 3 }), missBoard: [makeMiss({ subject: 'Time management' })] }),
    );
    expect(standing.eligibleToAdvance).toBe(true);
    expect(standing.openMisses).toHaveLength(1);
  });

  it('holds a Level 1 learner to the level’s stated ten scenarios', () => {
    const standing = evaluateStanding(makeEvidence({ level: 1, cases: blueRun(5) }));
    const requirement = standing.levelRequirements.find((r) => r.id === 'meaningful_scenarios');
    expect(requirement?.met).toBe(false);
    expect(requirement?.detail).toContain('5 of 10');
    expect(standing.eligibleToAdvance).toBe(false);

    const ready = evaluateStanding(makeEvidence({ level: 1, cases: blueRun(10) }));
    expect(ready.eligibleToAdvance).toBe(true);
  });

  it('sets no scenario minimum at levels the program does not state one for', () => {
    const standing = evaluateStanding(makeEvidence({ level: 3, cases: blueRun(5, { level: 3 }) }));
    const requirement = standing.levelRequirements.find((r) => r.id === 'meaningful_scenarios');
    expect(requirement?.met).toBe(true);
    expect(requirement?.detail).toMatch(/no minimum count/);
    expect(standing.eligibleToAdvance).toBe(true);
  });

  it('counts only cases at the learner’s current level toward the streak', () => {
    const standing = evaluateStanding(
      makeEvidence({ level: 2, cases: [...blueRun(5, { level: 1 }), makeCase({ level: 2, createdAt: at(6) })] }),
    );
    expect(standing.casesAtLevel).toBe(1);
    expect(standing.consecutiveBlue).toBe(1);
  });

  it('counts a challenge-mode case on the same terms as any other', () => {
    const cases = [...blueRun(4), makeCase({ challengeMode: true, createdAt: at(5) })];
    const standing = evaluateStanding(makeEvidence({ level: 3, cases: cases.map((c) => ({ ...c, level: 3 })) }));
    expect(standing.consecutiveBlue).toBe(5);
    expect(standing.eligibleToAdvance).toBe(true);
  });

  it('has no next level at the top of the program', () => {
    const standing = evaluateStanding(makeEvidence({ level: 6, cases: blueRun(5, { level: 6 }) }));
    expect(standing.eligibleToAdvance).toBe(true);
    expect(standing.nextLevel).toBeNull();
  });

  it('names the most serious blocker as the next action, hard stops first', () => {
    const standing = evaluateStanding(
      makeEvidence({
        level: 3,
        cases: [
          ...blueRun(4, { level: 3 }),
          makeCase({
            level: 3,
            band: 'blue',
            criticalErrors: ['Patient deteriorated and was never reassessed.'],
            hardStops: [failedHardStop('max_bvm', ['Two NPAs'])],
            createdAt: at(5),
          }),
        ],
        missBoard: [makeMiss({ critical: true })],
      }),
    );
    expect(standing.nextAction).toMatch(/Max BVM/);
  });

  it('carries the level identity, patch, and Ron mode through unchanged', () => {
    const standing = evaluateStanding(
      makeEvidence({ name: 'Dana Rivera', badgeId: 'B-9', certification: 'emt', level: 3, personalityMode: 2 }),
    );
    expect(standing.learner).toEqual({ name: 'Dana Rivera', badgeId: 'B-9' });
    expect(standing.certification).toBe('emt');
    expect(standing.levelTitle).toBe('Protocol Mastery + ALS Integration');
    expect(standing.personalityMode).toBe(2);
    expect(standing.coaching).toBe('learner_owns_assessment');
  });
});
