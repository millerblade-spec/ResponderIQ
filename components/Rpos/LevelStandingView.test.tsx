import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LevelStandingView } from './LevelStandingView';
import { evaluateStanding } from '@/lib/rpos/progression';
import { at, blueRun, failedHardStop, makeCase, makeEvidence, makeMiss } from '@/lib/rpos/rpos.fixture';

describe('LevelStandingView', () => {
  it('shows the responder, their patch, and their level', () => {
    const standing = evaluateStanding(
      makeEvidence({ name: 'Dana Rivera', badgeId: 'B-9', certification: 'emt', level: 3 }),
    );
    render(<LevelStandingView standing={standing} />);
    expect(screen.getByText('Dana Rivera')).toBeInTheDocument();
    expect(screen.getByText('B-9')).toBeInTheDocument();
    expect(screen.getByText('EMT')).toBeInTheDocument();
    expect(screen.getByLabelText('Current level')).toHaveTextContent('3 — Protocol Mastery + ALS Integration');
  });

  it('shows the level’s call sign where the program gives one', () => {
    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 4 }))} />);
    expect(screen.getByText(/WELCOME TO THUNDERDOME/)).toBeInTheDocument();
  });

  it('shows the mastery streak out of five', () => {
    const standing = evaluateStanding(makeEvidence({ level: 3, cases: blueRun(3, { level: 3 }) }));
    render(<LevelStandingView standing={standing} />);
    expect(screen.getByLabelText('Consecutive BLUE cases')).toHaveTextContent('3 of 5');
  });

  it('raises blockers as an alert, above anything numeric', () => {
    const standing = evaluateStanding(
      makeEvidence({
        level: 3,
        cases: [
          ...blueRun(4, { level: 3 }),
          makeCase({ level: 3, band: 'blue', score: 100, hardStops: [failedHardStop('dsi', ['Full 90-second paralysis countdown'])], createdAt: at(5) }),
        ],
      }),
    );
    render(<LevelStandingView standing={standing} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/Blocking advancement/i)).toBeInTheDocument();
    expect(within(alert).getByText(/DSI was not completed in full/i)).toBeInTheDocument();
  });

  it('says plainly when a responder is eligible to advance', () => {
    const standing = evaluateStanding(makeEvidence({ level: 3, cases: blueRun(5, { level: 3 }) }));
    render(<LevelStandingView standing={standing} />);
    expect(screen.getByText('Eligible to advance')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names every band in words, not only in color', () => {
    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 3 }))} />);
    for (const band of ['BLUE', 'GREEN', 'YELLOW', 'RED']) {
      expect(screen.getByRole('row', { name: new RegExp(band) })).toBeInTheDocument();
    }
  });

  it('lists open Miss Board entries and flags the criticals', () => {
    const standing = evaluateStanding(
      makeEvidence({ level: 3, missBoard: [makeMiss({ subject: 'Scene safety', category: 'safety', critical: true })] }),
    );
    render(<LevelStandingView standing={standing} />);
    const row = screen.getByRole('row', { name: /Scene safety/ });
    expect(within(row).getByText('Critical')).toBeInTheDocument();
  });

  it('says the Miss Board is clear rather than showing an empty table', () => {
    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 3 }))} />);
    expect(screen.getByText(/Nothing open on the Miss Board/i)).toBeInTheDocument();
  });

  it('shows the Level 1 grading weights, and says there are none at other levels', () => {
    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 1 }))} />);
    expect(screen.getByText(/Assessment 45%/)).toBeInTheDocument();

    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 5 }))} />);
    expect(screen.getByText(/states no weighting for this level/i)).toBeInTheDocument();
  });

  it('shows Level 2’s hidden difficulty mix', () => {
    render(<LevelStandingView standing={evaluateStanding(makeEvidence({ level: 2 }))} />);
    expect(screen.getByText(/50% straightforward/)).toBeInTheDocument();
    expect(screen.getByText(/never disclosed/)).toBeInTheDocument();
  });
});
