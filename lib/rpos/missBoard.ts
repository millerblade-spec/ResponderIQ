/**
 * The Miss Board.
 *
 * Prompt #1: "Track assessment, protocol, medication/dose, clinical reasoning,
 * safety, and operations misses. Retest old weaknesses later using different
 * presentations."
 *
 * Two things follow from that sentence and drive this module:
 * - An entry is not cleared by the learner doing better in general. It clears
 *   when a LATER case exercised the same subject cleanly — a different
 *   presentation of the same weakness.
 * - Critical entries block advancement while unresolved, which is why every
 *   entry carries its own criticality rather than inheriting it from a score.
 */
import type { CaseRecord, MissBoardEntry, MissCategory } from './types';

export const MISS_CATEGORIES: readonly { readonly key: MissCategory; readonly label: string }[] = [
  { key: 'assessment', label: 'Assessment' },
  { key: 'protocol', label: 'Protocol' },
  { key: 'medication_dose', label: 'Medication / dose' },
  { key: 'clinical_reasoning', label: 'Clinical reasoning' },
  { key: 'safety', label: 'Safety' },
  { key: 'operations', label: 'Operations' },
];

export function missCategoryLabel(category: MissCategory): string {
  return MISS_CATEGORIES.find((entry) => entry.key === category)?.label ?? category;
}

/** Unresolved entries, criticals first, then oldest first — the retest queue. */
export function openMisses(board: readonly MissBoardEntry[]): readonly MissBoardEntry[] {
  return [...board]
    .filter((entry) => entry.resolvedAt == null)
    .sort((a, b) => {
      if (a.critical !== b.critical) return a.critical ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

export function openCriticalMisses(board: readonly MissBoardEntry[]): readonly MissBoardEntry[] {
  return openMisses(board).filter((entry) => entry.critical);
}

/** Open entries per category — what to build the next case around. */
export function openMissesByCategory(board: readonly MissBoardEntry[]): Readonly<Record<MissCategory, number>> {
  const counts = Object.fromEntries(MISS_CATEGORIES.map(({ key }) => [key, 0])) as Record<MissCategory, number>;
  for (const entry of openMisses(board)) counts[entry.category] += 1;
  return counts;
}

/**
 * The subjects a later case must exercise cleanly to clear the board. The
 * scenario builder reads this to bring old weaknesses back — deliberately the
 * subjects, not the original scenarios, since the retest must be a different
 * presentation.
 */
export function retestSubjects(board: readonly MissBoardEntry[]): readonly string[] {
  return [...new Set(openMisses(board).map((entry) => entry.subject))];
}

export interface MissResolution {
  readonly entryId: string;
  readonly resolvedAt: string;
  readonly resolvedByCaseId: string;
}

/**
 * Which open entries a case clears: those whose subject the case exercised
 * without missing it again. A case that misses the same subject again clears
 * nothing — and the fresh miss it records keeps the entry alive rather than
 * stacking a duplicate.
 *
 * `subjectsExercised` is what the case actually put in front of the learner.
 * An entry is never cleared by a case that never touched its subject, which is
 * what keeps "retest old weaknesses" from degrading into "wait long enough".
 */
export function resolutionsFromCase(
  board: readonly MissBoardEntry[],
  caseRecord: CaseRecord,
  subjectsExercised: readonly string[],
): readonly MissResolution[] {
  const exercised = new Set(subjectsExercised);
  const missedAgain = new Set(caseRecord.misses.map((miss) => miss.subject));

  return openMisses(board)
    .filter((entry) => new Date(entry.createdAt).getTime() <= new Date(caseRecord.createdAt).getTime())
    .filter((entry) => entry.sourceCaseId !== caseRecord.caseId)
    .filter((entry) => exercised.has(entry.subject) && !missedAgain.has(entry.subject))
    .map((entry) => ({ entryId: entry.id, resolvedAt: caseRecord.createdAt, resolvedByCaseId: caseRecord.caseId }));
}

/** Applies resolutions to a board, leaving everything else untouched. */
export function applyResolutions(
  board: readonly MissBoardEntry[],
  resolutions: readonly MissResolution[],
): readonly MissBoardEntry[] {
  const byId = new Map(resolutions.map((resolution) => [resolution.entryId, resolution]));
  return board.map((entry) => {
    const resolution = byId.get(entry.id);
    return resolution
      ? { ...entry, resolvedAt: resolution.resolvedAt, resolvedByCaseId: resolution.resolvedByCaseId }
      : entry;
  });
}
