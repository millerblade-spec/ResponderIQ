import type { CompetencyLevel, ProgramState, StageStatus } from '@/lib/rpos/types';
import styles from './Program.module.css';

/**
 * The presentation of one responder's program standing: status, next action,
 * open safety concerns, stages, competencies. A pure render of an already
 * evaluated ProgramState — no data access here, so it can be rendered from a
 * page, a roster row, or a test without a database.
 *
 * Administrator-facing. Same rule as the run review: numbers and standing are
 * never shown to a learner, so nothing in here is reachable from the learner
 * side of the app.
 */

const STATUS_LABEL: Readonly<Record<ProgramState['status'], string>> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  field_ready: 'Field ready',
};

const STAGE_STATUS_LABEL: Readonly<Record<StageStatus, string>> = {
  locked: 'Locked',
  available: 'Available',
  in_progress: 'In progress',
  complete: 'Complete',
};

const STAGE_STATUS_CLASS: Readonly<Record<StageStatus, string>> = {
  locked: styles.statusLocked,
  available: styles.statusAvailable,
  in_progress: styles.statusInProgress,
  complete: styles.statusComplete,
};

const LEVEL_LABEL: Readonly<Record<CompetencyLevel, string>> = {
  not_started: 'Not started',
  developing: 'Developing',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

const LEVEL_CLASS: Readonly<Record<CompetencyLevel, string>> = {
  not_started: styles.levelNotStarted,
  developing: styles.levelDeveloping,
  proficient: styles.levelProficient,
  mastered: styles.levelMastered,
};

function percent(value: number | null): string {
  return value == null ? '—' : `${value}%`;
}

interface ProgramStandingProps {
  readonly state: ProgramState;
}

export function ProgramStanding({ state }: ProgramStandingProps) {
  return (
    <>
      <div className={styles.standing}>
        <div>
          <span className={styles.standingLabel}>Responder</span>
          <span className={styles.standingValue}>{state.learner.name}</span>
        </div>
        <div>
          <span className={styles.standingLabel}>Badge / employee ID</span>
          <span className={styles.standingValue}>{state.learner.badgeId}</span>
        </div>
        <div>
          <span className={styles.standingLabel}>Program standing</span>
          <span className={styles.standingValue} aria-label="Program standing">
            {STATUS_LABEL[state.status]}
          </span>
        </div>
        <div>
          <span className={styles.standingLabel}>Stages complete</span>
          <span className={styles.standingValue}>
            {state.stagesComplete} of {state.stageCount}
          </span>
        </div>
      </div>

      {state.openConcerns.length > 0 && (
        <div className={styles.concerns} role="alert">
          <p className={styles.concernsHeading}>Critical Safety Concern Recorded</p>
          <ul className={styles.concernsList}>
            {state.openConcerns.map((concern) => (
              <li key={concern}>{concern}</li>
            ))}
          </ul>
        </div>
      )}

      <p className={styles.nextAction}>
        <span className={styles.standingLabel}>Next action</span>
        {state.nextAction}
      </p>

      <h2 className={styles.sectionHeading}>Stages</h2>
      <ul className={styles.list}>
        {state.stages.map((stage) => (
          <li key={stage.id} className={styles.stage}>
            <div className={styles.stageHead}>
              <span className={styles.stageTitle}>{stage.title}</span>
              <span className={`${styles.badge} ${STAGE_STATUS_CLASS[stage.status]}`}>
                {STAGE_STATUS_LABEL[stage.status]}
              </span>
            </div>
            <p className={styles.stagePurpose}>{stage.purpose}</p>
            <ul className={styles.requirements}>
              {stage.requirements.map((requirement) => (
                <li key={requirement.id} className={styles.requirement}>
                  {/* The word, not only the mark: "Met"/"Not met" is read out, the glyph is decorative. */}
                  <span className={styles.requirementMark} aria-hidden="true">
                    {requirement.met ? '✓' : '–'}
                  </span>
                  <span>
                    {requirement.label} <span className={styles.srOnly}>{requirement.met ? '— met' : '— not met'}</span>
                    <br />
                    <span className={styles.requirementDetail}>{requirement.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2 className={styles.sectionHeading}>Competencies</h2>
      <table className={styles.competencyTable}>
        <thead>
          <tr>
            <th scope="col">Competency</th>
            <th scope="col">Level</th>
            <th scope="col" className={styles.numeric}>Latest</th>
            <th scope="col" className={styles.numeric}>Best</th>
            <th scope="col" className={styles.numeric}>Average</th>
            <th scope="col" className={styles.numeric}>Attempts</th>
          </tr>
        </thead>
        <tbody>
          {state.competencies.map((competency) => (
            <tr key={competency.key}>
              <th scope="row">{competency.label}</th>
              <td className={LEVEL_CLASS[competency.level]}>{LEVEL_LABEL[competency.level]}</td>
              <td className={styles.numeric}>{percent(competency.latestPercent)}</td>
              <td className={styles.numeric}>{percent(competency.bestPercent)}</td>
              <td className={styles.numeric}>{percent(competency.averagePercent)}</td>
              <td className={styles.numeric}>{competency.attempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
