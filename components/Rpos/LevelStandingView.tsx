import { levelDefinition } from '@/lib/rpos/levels';
import { gradingWeightsFor, RPOS_BANDS } from '@/lib/rpos/grading';
import { missCategoryLabel } from '@/lib/rpos/missBoard';
import type { BandName, LevelStanding } from '@/lib/rpos/types';
import styles from './Rpos.module.css';

/**
 * One responder's RPOS standing: level, patch, mastery streak, what is
 * blocking advancement, the Miss Board, and the level's own coaching posture.
 *
 * A pure render of an already-evaluated standing — no data access — so it can
 * be rendered from a page or a test without a database.
 *
 * Administrator-facing, like every other view that exposes grading.
 */

const BAND_CLASS: Readonly<Record<BandName, string>> = {
  blue: styles.bandBlue,
  green: styles.bandGreen,
  yellow: styles.bandYellow,
  red: styles.bandRed,
};

const BAND_LABEL: Readonly<Record<BandName, string>> = {
  blue: 'BLUE',
  green: 'GREEN',
  yellow: 'YELLOW',
  red: 'RED',
};

const COACHING_LABEL = {
  active_coaching: 'Active coaching',
  broad_prompts: 'Broad prompts only',
  learner_owns_assessment: 'Learner owns the assessment — limited prompting',
  very_little_rescue: 'Very little rescue',
  training_wheels_off: 'Training wheels off',
} as const;

const CERTIFICATION_LABEL = { emt: 'EMT', paramedic: 'Paramedic' } as const;

const PERSONALITY_LABEL = ['Clinical', 'Coach', 'Ron Mode'] as const;

interface LevelStandingViewProps {
  readonly standing: LevelStanding;
}

export function LevelStandingView({ standing }: LevelStandingViewProps) {
  const definition = levelDefinition(standing.level);
  const weights = gradingWeightsFor(standing.level);

  return (
    <>
      <div className={styles.standing}>
        <div>
          <span className={styles.standingLabel}>Responder</span>
          <span className={styles.standingValue}>{standing.learner.name}</span>
        </div>
        <div>
          <span className={styles.standingLabel}>Badge / employee ID</span>
          <span className={styles.standingValue}>{standing.learner.badgeId}</span>
        </div>
        <div>
          <span className={styles.standingLabel}>Patch</span>
          <span className={styles.standingValue}>{CERTIFICATION_LABEL[standing.certification]}</span>
        </div>
        <div>
          <span className={styles.standingLabel}>Level</span>
          <span className={styles.standingValue} aria-label="Current level">
            {standing.level} — {standing.levelTitle}
          </span>
        </div>
        <div>
          <span className={styles.standingLabel}>Ron</span>
          <span className={styles.standingValue}>{PERSONALITY_LABEL[standing.personalityMode]}</span>
        </div>
      </div>

      {standing.levelCallSign && <p className={styles.callSign}>⚡ {standing.levelCallSign}</p>}
      <p className={styles.levelQuestion}>“{definition.question}”</p>

      {/* Hard stops and critical errors come before anything numeric: a good
          score never erases a missed mandatory element. */}
      {standing.blockers.length > 0 ? (
        <div className={styles.blockers} role="alert">
          <p className={styles.blockersHeading}>Blocking advancement</p>
          <ul className={styles.blockerList}>
            {standing.blockers.map((blocker) => (
              <li key={`${blocker.kind}:${blocker.summary}`}>
                <span className={styles.blockerSummary}>{blocker.summary}</span>
                <br />
                <span className={styles.blockerDetail}>{blocker.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={styles.eligible}>
          <p className={styles.eligibleHeading}>Eligible to advance</p>
          <p className={styles.blockerDetail}>
            {standing.nextLevel
              ? `Five consecutive BLUE cases, no critical errors, no unresolved critical Miss Board items, level requirements complete. Next: level ${standing.nextLevel}.`
              : 'Level 6 is the top of the program.'}
          </p>
        </div>
      )}

      <p className={styles.nextAction}>
        <span className={styles.standingLabel}>Next action</span>
        {standing.nextAction}
      </p>

      <h2 className={styles.sectionHeading}>Mastery streak</h2>
      <p className={styles.sectionNote}>
        Advancement takes {standing.requiredConsecutiveBlue} consecutive BLUE cases. A case only counts if it was
        BLUE <em>and</em> carried no critical error and no hard-stop failure — a critical error blocks mastery
        regardless of the number.
      </p>
      <div className={styles.streak} aria-label="Consecutive BLUE cases">
        {Array.from({ length: standing.requiredConsecutiveBlue }, (_, index) => (
          <span
            key={index}
            className={`${styles.pip} ${index < standing.consecutiveBlue ? styles.pipEarned : ''}`}
            aria-hidden="true"
          />
        ))}
        <span className={styles.rowMeta}>
          {standing.consecutiveBlue} of {standing.requiredConsecutiveBlue}
        </span>
      </div>

      <h2 className={styles.sectionHeading}>Cases at this level</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Band</th>
            <th scope="col">Meaning</th>
            <th scope="col">Range</th>
            <th scope="col" className={styles.numeric}>Cases</th>
          </tr>
        </thead>
        <tbody>
          {RPOS_BANDS.map((band) => (
            <tr key={band.name}>
              <th scope="row" className={BAND_CLASS[band.name]}>
                {BAND_LABEL[band.name]}
              </th>
              <td>{band.label}</td>
              <td>
                {band.min}–{band.max}
              </td>
              <td className={styles.numeric}>{standing.bandCounts[band.name]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={styles.sectionHeading}>Miss Board</h2>
      <p className={styles.sectionNote}>
        Open weaknesses, criticals first. An entry clears only when a later case retests the same subject with a
        different presentation — never by time passing.
      </p>
      {standing.openMisses.length === 0 ? (
        <p className={styles.empty}>Nothing open on the Miss Board.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Category</th>
              <th scope="col">Detail</th>
              <th scope="col">Critical</th>
            </tr>
          </thead>
          <tbody>
            {standing.openMisses.map((entry) => (
              <tr key={entry.id}>
                <th scope="row">{entry.subject}</th>
                <td>{missCategoryLabel(entry.category)}</td>
                <td className={styles.rowMeta}>{entry.detail}</td>
                <td className={entry.critical ? styles.criticalFlag : undefined}>
                  {entry.critical ? 'Critical' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Level {standing.level} posture</h2>
      <p className={styles.sectionNote}>{definition.focus}</p>
      <table className={styles.table}>
        <tbody>
          <tr>
            <th scope="row">Coaching</th>
            <td>{COACHING_LABEL[standing.coaching]}</td>
          </tr>
          {definition.hiddenMix && (
            <tr>
              <th scope="row">Hidden difficulty mix</th>
              <td>
                {definition.hiddenMix.straightforward}% straightforward · {definition.hiddenMix.moderate}% moderate ·{' '}
                {definition.hiddenMix.difficult}% difficult (never disclosed, never rigid)
              </td>
            </tr>
          )}
          <tr>
            <th scope="row">Introduces</th>
            <td>
              <ul>
                {definition.introduces.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </td>
          </tr>
          <tr>
            <th scope="row">Grading weight</th>
            <td>
              {weights
                ? weights.map((weight) => `${weight.label} ${weight.percent}%`).join(' · ')
                : 'The program states no weighting for this level.'}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
