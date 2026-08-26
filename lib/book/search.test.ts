import { describe, it, expect } from 'vitest';
import { BOOK_INDEX, MAX_SEARCH_RESULTS, parseQuery, searchBook } from './search';
import { BOOK_CHAPTERS } from './content';
import { MEDICATIONS } from './formulary';
import { VITAL_RANGES } from './vitals';

describe('Paramedic Book content integrity', () => {
  it('gives every chapter, entry, medication and vitals row a unique id', () => {
    const ids = [
      ...BOOK_CHAPTERS.map((c) => c.id),
      ...BOOK_CHAPTERS.flatMap((c) => c.entries.map((e) => e.id)),
      ...MEDICATIONS.map((m) => m.id),
      ...VITAL_RANGES.map((v) => v.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry at least one reference point and every drug card a dose', () => {
    for (const chapter of BOOK_CHAPTERS) {
      expect(chapter.entries.length).toBeGreaterThan(0);
      for (const entry of chapter.entries) {
        expect(entry.points.length).toBeGreaterThan(0);
        expect(entry.summary).not.toBe('');
      }
    }
    for (const med of MEDICATIONS) {
      expect(med.adultDose).not.toBe('');
      expect(med.indications.length).toBeGreaterThan(0);
      expect(med.contraindications.length).toBeGreaterThan(0);
    }
  });

  it('indexes every entry and medication, plus the vitals table', () => {
    const entryCount = BOOK_CHAPTERS.reduce((total, chapter) => total + chapter.entries.length, 0);
    expect(BOOK_INDEX).toHaveLength(entryCount + MEDICATIONS.length + 1);
    expect(BOOK_INDEX.filter((record) => record.kind === 'vitals')).toHaveLength(1);
  });
});

describe('searchBook', () => {
  it('returns nothing for an empty or whitespace-only query', () => {
    expect(searchBook('')).toEqual([]);
    expect(searchBook('   ')).toEqual([]);
    expect(parseQuery('   ')).toEqual([]);
  });

  it('ranks a title match above a body-text-only match', () => {
    const results = searchBook('tourniquet');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Hemorrhage control');
  });

  it('finds a drug by its generic name, its trade name, and a misremembered spelling of neither', () => {
    expect(searchBook('naloxone')[0].id).toBe('med-naloxone');
    expect(searchBook('narcan')[0].id).toBe('med-naloxone');
    expect(searchBook('zofran')[0].id).toBe('med-ondansetron');
  });

  it('matches keywords that never appear in the visible text', () => {
    // 'no elevator' is a keyword on the stairs entry, not a phrase in its body.
    const results = searchBook('elevator');
    expect(results.map((r) => r.id)).toContain('stairs');
  });

  it('narrows rather than widens as terms are added', () => {
    const broad = searchBook('pediatric');
    const narrow = searchBook('pediatric epinephrine');
    expect(narrow.length).toBeLessThan(broad.length);
    expect(narrow.every((r) => r.haystack.includes('pediatric') && r.haystack.includes('epinephrine'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(searchBook('STEMI').map((r) => r.id)).toEqual(searchBook('stemi').map((r) => r.id));
  });

  it('finds the vitals table by what a trainee would actually type', () => {
    expect(searchBook('pediatric heart rate').map((r) => r.id)).toContain('vitals');
  });

  it('returns an empty list for a term the book does not cover', () => {
    expect(searchBook('zzzqqx')).toEqual([]);
  });

  it('caps results at the limit and honors an explicit smaller one', () => {
    // 'the' appears throughout the book, so this exercises the cap.
    expect(searchBook('the').length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
    expect(searchBook('the', 3)).toHaveLength(3);
  });

  it('orders equally-scored results deterministically', () => {
    expect(searchBook('airway').map((r) => r.id)).toEqual(searchBook('airway').map((r) => r.id));
  });

  it('carries a chapter breadcrumb on every result so the UI can say where it lives', () => {
    for (const result of searchBook('shock')) {
      expect(result.chapterId).not.toBe('');
      expect(result.chapterTitle).not.toBe('');
    }
  });
});
