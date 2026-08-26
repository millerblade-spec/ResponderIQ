'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark/Wordmark';
import { BOOK_CHAPTERS, PROTOCOL_DISCLAIMER } from '@/lib/book/content';
import { FORMULARY_CHAPTER_ID, FORMULARY_CHAPTER_TITLE, MEDICATIONS } from '@/lib/book/formulary';
import { VITALS_CHAPTER_ID, VITALS_CHAPTER_TITLE, VITAL_RANGES, VITALS_NOTES } from '@/lib/book/vitals';
import { searchBook } from '@/lib/book/search';
import styles from './ParamedicBook.module.css';

/** One row in the contents rail. The formulary and the vitals table are sections too. */
interface SectionRef {
  readonly id: string;
  readonly title: string;
}

const SECTIONS: readonly SectionRef[] = [
  ...BOOK_CHAPTERS.map((chapter) => ({ id: chapter.id, title: chapter.title })),
  { id: FORMULARY_CHAPTER_ID, title: FORMULARY_CHAPTER_TITLE },
  { id: VITALS_CHAPTER_ID, title: VITALS_CHAPTER_TITLE },
];

const FIRST_SECTION_ID = SECTIONS[0].id;

/**
 * The Paramedic Book (in-app paramedic field reference).
 *
 * Deliberately its own route rather than a panel inside the simulator: the
 * book is study and pre-call material, and keeping a reference permanently
 * open during an active call is exactly the habit the simulator is trying not
 * to teach (§3, §22 — the same reasoning that put the color legend on
 * /instructions instead of in the HUD).
 *
 * Two panes: a contents rail and the open section. Search replaces the open
 * section with ranked results; choosing one opens its section and scrolls to
 * the topic. All ranking lives in lib/book/search.ts — this component only
 * renders what that returns.
 */
export function ParamedicBook() {
  const [sectionId, setSectionId] = useState<string>(FIRST_SECTION_ID);
  const [query, setQuery] = useState('');
  /**
   * The element to bring into view once the new pane has rendered. A ref, not
   * state: the effect below consumes it, and clearing it must not schedule
   * another render.
   */
  const pendingScrollRef = useRef<string | null>(null);

  const trimmedQuery = query.trim();
  const results = useMemo(() => searchBook(trimmedQuery), [trimmedQuery]);
  const searching = trimmedQuery.length > 0;

  const openChapter = BOOK_CHAPTERS.find((chapter) => chapter.id === sectionId) ?? null;
  const openSectionTitle = SECTIONS.find((section) => section.id === sectionId)?.title ?? '';

  // Bring the requested topic into view once the pane it lives in has rendered.
  // Keyed on both the open section and whether search is showing, because
  // choosing a result inside the already-open section changes only the latter.
  // scrollIntoView is called optionally: jsdom (and any non-browser renderer)
  // does not implement it, and navigation must still work without it.
  useEffect(() => {
    const targetId = pendingScrollRef.current;
    if (!targetId) return;
    pendingScrollRef.current = null;
    document.getElementById(targetId)?.scrollIntoView?.({ block: 'start' });
  }, [sectionId, searching]);

  function openSection(nextSectionId: string) {
    setSectionId(nextSectionId);
    setQuery('');
    pendingScrollRef.current = `section-${nextSectionId}`;
  }

  function openResult(nextSectionId: string, entryId: string) {
    setSectionId(nextSectionId);
    setQuery('');
    pendingScrollRef.current = entryId;
  }

  return (
    <main className={styles.wrap}>
      <div className={styles.header}>
        <Wordmark size={1.6} />
        <h1 className={styles.heading}>Paramedic Book</h1>
        <p className={styles.tagline}>
          Field reference for the material ResponderIQ scenarios assume you already carry.
        </p>
      </div>

      <p className={styles.disclaimer} role="note">
        <span className={styles.disclaimerIcon} aria-hidden="true">
          ▲
        </span>
        <span>
          <span className={styles.disclaimerLabel}>Caution:</span> {PROTOCOL_DISCLAIMER}
        </span>
      </p>

      <div className={styles.searchRow}>
        <label className={styles.searchLabel} htmlFor="book-search">
          Search the book
        </label>
        <input
          id="book-search"
          className={styles.searchInput}
          type="search"
          value={query}
          placeholder="e.g. tourniquet, epinephrine, pediatric heart rate"
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className={styles.searchStatus} role="status">
          {searching ? `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${trimmedQuery}”` : ''}
        </p>
      </div>

      <div className={styles.body}>
        <nav className={styles.contents} aria-label="Contents">
          <h2 className={styles.contentsTitle}>Contents</h2>
          <ul className={styles.contentsList}>
            {SECTIONS.map((section) => {
              const current = !searching && section.id === sectionId;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={current ? `${styles.contentsLink} ${styles.contentsLinkActive}` : styles.contentsLink}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => openSection(section.id)}
                  >
                    {section.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.content}>
          {searching ? (
            <section aria-label="Search results">
              {results.length === 0 ? (
                <p className={styles.empty}>
                  Nothing in the book matches “{trimmedQuery}”. Try a shorter term, a generic drug name, or an
                  abbreviation.
                </p>
              ) : (
                <ul className={styles.results}>
                  {results.map((result) => (
                    <li key={`${result.kind}-${result.id}`}>
                      <button
                        type="button"
                        className={styles.result}
                        onClick={() => openResult(result.chapterId, result.id)}
                      >
                        <span className={styles.resultCrumb}>{result.chapterTitle}</span>
                        <span className={styles.resultTitle}>{result.title}</span>
                        <span className={styles.resultSummary}>{result.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section id={`section-${sectionId}`} aria-label={openSectionTitle}>
              {openChapter ? (
                <>
                  <h2 className={styles.sectionHeading}>{openChapter.title}</h2>
                  <p className={styles.sectionPurpose}>{openChapter.purpose}</p>
                  {openChapter.entries.map((entry) => (
                    <article key={entry.id} id={entry.id} className={styles.entry}>
                      <h3 className={styles.entryTitle}>{entry.title}</h3>
                      <p className={styles.entrySummary}>{entry.summary}</p>
                      <ul className={styles.points}>
                        {entry.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </>
              ) : sectionId === FORMULARY_CHAPTER_ID ? (
                <>
                  <h2 className={styles.sectionHeading}>{FORMULARY_CHAPTER_TITLE}</h2>
                  <p className={styles.sectionPurpose}>
                    Typical training doses for recall. Every one of them is superseded by your protocol.
                  </p>
                  {MEDICATIONS.map((med) => (
                    <article key={med.id} id={med.id} className={styles.entry}>
                      <h3 className={styles.entryTitle}>
                        {med.name}
                        {med.alsoKnownAs ? <span className={styles.aka}> ({med.alsoKnownAs})</span> : null}
                      </h3>
                      <p className={styles.entrySummary}>{med.drugClass}</p>
                      <dl className={styles.drugCard}>
                        <dt>Indications</dt>
                        <dd>
                          <ul className={styles.points}>
                            {med.indications.map((indication) => (
                              <li key={indication}>{indication}</li>
                            ))}
                          </ul>
                        </dd>
                        <dt>Adult dose</dt>
                        <dd>{med.adultDose}</dd>
                        {med.pediatricDose ? (
                          <>
                            <dt>Pediatric dose</dt>
                            <dd>{med.pediatricDose}</dd>
                          </>
                        ) : null}
                        <dt>Contraindications</dt>
                        <dd>
                          <ul className={styles.points}>
                            {med.contraindications.map((contraindication) => (
                              <li key={contraindication}>{contraindication}</li>
                            ))}
                          </ul>
                        </dd>
                        <dt>Cautions</dt>
                        <dd>
                          <ul className={styles.points}>
                            {med.cautions.map((caution) => (
                              <li key={caution}>{caution}</li>
                            ))}
                          </ul>
                        </dd>
                      </dl>
                    </article>
                  ))}
                </>
              ) : (
                <>
                  <h2 className={styles.sectionHeading} id={VITALS_CHAPTER_ID}>
                    {VITALS_CHAPTER_TITLE}
                  </h2>
                  <p className={styles.sectionPurpose}>
                    Awake, at-rest ranges for a well patient. They tell you a number is abnormal — not, on their own,
                    that it needs treating.
                  </p>
                  <div className={styles.tableScroll}>
                    <table className={styles.table}>
                      <caption className={styles.tableCaption}>Normal vital signs by age</caption>
                      <thead>
                        <tr>
                          <th scope="col">Age group</th>
                          <th scope="col">Age</th>
                          <th scope="col">Heart rate (/min)</th>
                          <th scope="col">Respirations (/min)</th>
                          <th scope="col">Systolic BP (mmHg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {VITAL_RANGES.map((range) => (
                          <tr key={range.id}>
                            <th scope="row">{range.ageGroup}</th>
                            <td>{range.age}</td>
                            <td>{range.heartRate}</td>
                            <td>{range.respiratoryRate}</td>
                            <td>{range.systolic}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ul className={styles.points}>
                    {VITALS_NOTES.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      <Link href="/dashboard" className={styles.backLink}>
        Back to dashboard
      </Link>
    </main>
  );
}
