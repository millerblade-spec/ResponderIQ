import { BOOK_CHAPTERS } from './content';
import { FORMULARY_CHAPTER_ID, FORMULARY_CHAPTER_TITLE, MEDICATIONS } from './formulary';
import { VITALS_CHAPTER_ID, VITALS_CHAPTER_TITLE, VITAL_RANGES, VITALS_NOTES } from './vitals';
import type { BookIndexRecord } from './types';

/**
 * A flat, pre-lowercased search index over every part of the book, plus the
 * ranking function the UI uses.
 *
 * Kept as a pure module with no React and no DOM so the search behaviour is
 * unit-testable on its own — the component only renders what this returns.
 * The index is built once at module load: the book is static typed data, so
 * rebuilding it per keystroke would be waste, and memoizing per query would
 * just be a second cache over an already-cheap scan of a few hundred strings.
 */

function buildIndex(): readonly BookIndexRecord[] {
  const records: BookIndexRecord[] = [];

  for (const chapter of BOOK_CHAPTERS) {
    for (const entry of chapter.entries) {
      records.push({
        kind: 'chapter',
        id: entry.id,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        title: entry.title,
        summary: entry.summary,
        haystack: [entry.title, entry.summary, ...entry.points, ...(entry.keywords ?? []), chapter.title]
          .join(' ')
          .toLowerCase(),
      });
    }
  }

  for (const med of MEDICATIONS) {
    records.push({
      kind: 'medication',
      id: med.id,
      chapterId: FORMULARY_CHAPTER_ID,
      chapterTitle: FORMULARY_CHAPTER_TITLE,
      title: med.name,
      summary: med.alsoKnownAs ? `${med.drugClass} — also known as ${med.alsoKnownAs}` : med.drugClass,
      haystack: [
        med.name,
        med.alsoKnownAs ?? '',
        med.drugClass,
        ...med.indications,
        med.adultDose,
        med.pediatricDose ?? '',
        ...med.contraindications,
        ...med.cautions,
        ...(med.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase(),
    });
  }

  // The vitals table is one addressable record rather than one per age band:
  // a trainee searching "pediatric heart rate" wants the table, not a row.
  records.push({
    kind: 'vitals',
    id: VITALS_CHAPTER_ID,
    chapterId: VITALS_CHAPTER_ID,
    chapterTitle: VITALS_CHAPTER_TITLE,
    title: 'Normal vital signs by age',
    summary: 'Awake, at-rest heart rate, respiratory rate and systolic pressure from newborn to adult.',
    haystack: [
      'normal vital signs by age heart rate pulse respiratory rate respirations blood pressure systolic pediatric peds adult',
      ...VITAL_RANGES.map((r) => `${r.ageGroup} ${r.age} ${r.heartRate} ${r.respiratoryRate} ${r.systolic}`),
      ...VITALS_NOTES,
    ]
      .join(' ')
      .toLowerCase(),
  });

  return records;
}

export const BOOK_INDEX: readonly BookIndexRecord[] = buildIndex();

/** Default cap on rendered results — enough to find the topic, short enough to scan. */
export const MAX_SEARCH_RESULTS = 12;

/**
 * Scores one record against already-lowercased terms.
 * Returns 0 when any term is missing, so multi-word queries narrow (AND)
 * rather than widen — "pediatric epinephrine" should not return every
 * pediatric topic.
 */
function scoreRecord(record: BookIndexRecord, terms: readonly string[]): number {
  const title = record.title.toLowerCase();
  const summary = record.summary.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (!record.haystack.includes(term)) return 0;

    if (title === term) score += 100;
    else if (title.startsWith(term)) score += 60;
    else if (title.includes(term)) score += 40;
    else if (summary.includes(term)) score += 12;
    else score += 4;
  }

  // A drug card is usually what someone typing a single word wants; the small
  // nudge only breaks ties, it never outranks a title match elsewhere.
  if (record.kind === 'medication') score += 2;

  return score;
}

/** Splits a raw query into lowercased terms, dropping empty fragments. */
export function parseQuery(query: string): readonly string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

/**
 * Ranked search over the whole book. An empty or whitespace-only query
 * returns nothing — the UI shows the contents instead of a result list.
 */
export function searchBook(query: string, limit: number = MAX_SEARCH_RESULTS): readonly BookIndexRecord[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];

  const scored: { record: BookIndexRecord; score: number }[] = [];
  for (const record of BOOK_INDEX) {
    const score = scoreRecord(record, terms);
    if (score > 0) scored.push({ record, score });
  }

  // Ties resolve alphabetically so the ordering is stable and reproducible
  // rather than dependent on index construction order.
  scored.sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));

  return scored.slice(0, limit).map((s) => s.record);
}
