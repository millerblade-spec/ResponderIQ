import { describe, it, expect } from 'vitest';
import {
  MISS_CATEGORIES,
  applyResolutions,
  openCriticalMisses,
  openMisses,
  openMissesByCategory,
  resolutionsFromCase,
  retestSubjects,
} from './missBoard';
import { at, makeCase, makeMiss } from './rpos.fixture';

describe('Miss Board', () => {
  it('tracks exactly the six categories the program names', () => {
    expect(MISS_CATEGORIES.map((category) => category.key)).toEqual([
      'assessment',
      'protocol',
      'medication_dose',
      'clinical_reasoning',
      'safety',
      'operations',
    ]);
  });

  it('queues open entries criticals first, then oldest first', () => {
    const board = [
      makeMiss({ id: 'a', subject: 'Old standard', createdAt: at(1) }),
      makeMiss({ id: 'b', subject: 'New critical', critical: true, createdAt: at(5) }),
      makeMiss({ id: 'c', subject: 'Older critical', critical: true, createdAt: at(2) }),
    ];
    expect(openMisses(board).map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
    expect(openCriticalMisses(board).map((entry) => entry.id)).toEqual(['c', 'b']);
  });

  it('leaves resolved entries out of the open queue', () => {
    const board = [
      makeMiss({ id: 'a', resolvedAt: at(9), resolvedByCaseId: 'case-9' }),
      makeMiss({ id: 'b' }),
    ];
    expect(openMisses(board).map((entry) => entry.id)).toEqual(['b']);
  });

  it('counts open entries per category', () => {
    const board = [
      makeMiss({ category: 'safety', critical: true }),
      makeMiss({ category: 'safety', critical: true }),
      makeMiss({ category: 'operations' }),
      makeMiss({ category: 'operations', resolvedAt: at(9), resolvedByCaseId: 'case-9' }),
    ];
    const counts = openMissesByCategory(board);
    expect(counts.safety).toBe(2);
    expect(counts.operations).toBe(1);
    expect(counts.medication_dose).toBe(0);
  });

  it('lists the subjects a later case has to retest, without duplicates', () => {
    const board = [
      makeMiss({ subject: 'Scene safety' }),
      makeMiss({ subject: 'Scene safety' }),
      makeMiss({ subject: 'Reassessment' }),
    ];
    expect(retestSubjects(board)).toEqual(['Scene safety', 'Reassessment']);
  });

  it('clears an entry when a later case exercised the same subject cleanly', () => {
    const board = [makeMiss({ id: 'a', subject: 'Scene safety', createdAt: at(1) })];
    const later = makeCase({ caseId: 'case-later', createdAt: at(4) });
    const resolutions = resolutionsFromCase(board, later, ['Scene safety', 'Reassessment']);
    expect(resolutions).toEqual([{ entryId: 'a', resolvedAt: at(4), resolvedByCaseId: 'case-later' }]);

    const updated = applyResolutions(board, resolutions);
    expect(updated[0].resolvedByCaseId).toBe('case-later');
    expect(openMisses(updated)).toEqual([]);
  });

  it('does not clear an entry the case never put in front of the learner', () => {
    const board = [makeMiss({ id: 'a', subject: 'Scene safety', createdAt: at(1) })];
    const later = makeCase({ caseId: 'case-later', createdAt: at(4) });
    // Time passing is not a retest.
    expect(resolutionsFromCase(board, later, ['Reassessment'])).toEqual([]);
  });

  it('does not clear an entry the case missed again', () => {
    const board = [makeMiss({ id: 'a', subject: 'Scene safety', createdAt: at(1) })];
    const later = makeCase({
      caseId: 'case-later',
      createdAt: at(4),
      misses: [
        {
          id: 'case-later:scene_safety',
          category: 'safety',
          subject: 'Scene safety',
          detail: 'Entered before clearance again.',
          critical: true,
          sourceCaseId: 'case-later',
          createdAt: at(4),
        },
      ],
    });
    expect(resolutionsFromCase(board, later, ['Scene safety'])).toEqual([]);
  });

  it('never lets a case clear the entry it created itself', () => {
    const board = [makeMiss({ id: 'a', subject: 'Scene safety', sourceCaseId: 'case-1', createdAt: at(3) })];
    const sameCase = makeCase({ caseId: 'case-1', createdAt: at(3) });
    expect(resolutionsFromCase(board, sameCase, ['Scene safety'])).toEqual([]);
  });

  it('never lets an earlier case clear an entry recorded after it', () => {
    const board = [makeMiss({ id: 'a', subject: 'Scene safety', createdAt: at(10) })];
    const earlier = makeCase({ caseId: 'case-early', createdAt: at(2) });
    expect(resolutionsFromCase(board, earlier, ['Scene safety'])).toEqual([]);
  });
});
