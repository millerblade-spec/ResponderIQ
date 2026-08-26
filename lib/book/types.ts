/**
 * Types for the Paramedic Book — the in-app paramedic field reference.
 *
 * All book material is typed data rather than inline JSX, for the same reason
 * lib/instructions/content.ts is: it is single-sourced, testable, and can be
 * indexed for search without scraping the DOM.
 */

/** Which part of the book an indexed result came from. */
export type BookSourceKind = 'chapter' | 'medication' | 'vitals';

/** One addressable topic inside a chapter (the leaf a search result points at). */
export interface BookEntry {
  /** Stable slug, unique within the book. Used as the DOM id and the deep-link hash. */
  readonly id: string;
  /** Topic heading. */
  readonly title: string;
  /** One-or-two-sentence orientation, shown under the heading. */
  readonly summary: string;
  /** The reference material itself, as discrete recallable points. */
  readonly points: readonly string[];
  /**
   * Extra search terms that do not appear in the visible text — abbreviations,
   * synonyms, and the street names a trainee is likely to type.
   */
  readonly keywords?: readonly string[];
}

/** A top-level section of the book. */
export interface BookChapter {
  /** Stable slug, unique within the book. */
  readonly id: string;
  /** Chapter title as shown in the contents rail. */
  readonly title: string;
  /** What this chapter is for — shown once under the chapter heading. */
  readonly purpose: string;
  readonly entries: readonly BookEntry[];
}

/** One drug card in the formulary. */
export interface Medication {
  readonly id: string;
  /** Generic name — always the primary label. */
  readonly name: string;
  /** Common trade or street name, if the trainee is likelier to hear that. */
  readonly alsoKnownAs?: string;
  /** Drug class. */
  readonly drugClass: string;
  readonly indications: readonly string[];
  /** Typical adult dose. Always paired with the protocol disclaimer in the UI. */
  readonly adultDose: string;
  /** Typical pediatric dose, where one is carried. */
  readonly pediatricDose?: string;
  /** Absolute or practical contraindications. */
  readonly contraindications: readonly string[];
  /** What to watch for after you give it. */
  readonly cautions: readonly string[];
  readonly keywords?: readonly string[];
}

/** Normal vital-sign ranges for one age band. */
export interface VitalRange {
  readonly id: string;
  /** Age band label. */
  readonly ageGroup: string;
  /** Approximate age span, spelled out. */
  readonly age: string;
  readonly heartRate: string;
  readonly respiratoryRate: string;
  /** Systolic blood pressure. */
  readonly systolic: string;
}

/** A flattened, searchable view over every part of the book. */
export interface BookIndexRecord {
  readonly kind: BookSourceKind;
  /** The entry/medication/vitals id — also the element id to scroll to. */
  readonly id: string;
  /** Chapter id this record lives under, for navigation. */
  readonly chapterId: string;
  /** Chapter title, shown as the result's breadcrumb. */
  readonly chapterTitle: string;
  /** Result heading. */
  readonly title: string;
  /** One-line context under the heading. */
  readonly summary: string;
  /** Everything searchable about this record, already lowercased. */
  readonly haystack: string;
}
