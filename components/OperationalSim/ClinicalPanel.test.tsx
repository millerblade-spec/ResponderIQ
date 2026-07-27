import { describe, it, expect } from 'vitest';
import { useMemo } from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { ClinicalPanel } from './ClinicalPanel';
import { useCrew } from './useCrew';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { fireResponseFor } from '@/lib/opsim/crew';
import { bls01Clinical, type ClinicalModel } from '@/lib/opsim/clinical';
import { bls01Differentials } from '@/lib/scenarios/bls-01.dispatch';

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const DIFF = ['mechanical_fall', 'syncope_cardiac', 'hip_fracture', 'stroke'];

function Harness({
  clock,
  unlocked,
  equipmentOnScene,
  model,
}: {
  clock: MissionClock;
  unlocked: boolean;
  equipmentOnScene: string[];
  model: ClinicalModel;
}) {
  const engines = useMemo(() => fireResponseFor('ems'), []);
  const controller = useCrew(engines, equipmentOnScene, clock, 5);
  return (
    <ClinicalPanel
      controller={controller}
      clock={clock}
      unlocked={unlocked}
      model={model}
      initialDifferential={DIFF}
      differentialChoices={bls01Differentials}
    />
  );
}

function renderClinical(unlocked = true, equipmentOnScene: string[] = [], model: ClinicalModel = bls01Clinical) {
  const source = new ManualTimeSource();
  const clock = new MissionClock(source);
  clock.start();
  const utils = render(<Harness clock={clock} unlocked={unlocked} equipmentOnScene={equipmentOnScene} model={model} />);
  const advance = (seconds: number) =>
    act(() => {
      source.advance(seconds * 1000);
      clock.tick();
    });
  return { ...utils, advance };
}

/** Perform a clinical action by assigning a named responder, then let it complete. */
function performAction(verb: RegExp, responderName: string, durationSeconds: number, advance: (s: number) => void) {
  fireEvent.click(screen.getByRole('button', { name: verb }));
  const picker = screen.getByLabelText('Choose who performs this');
  fireEvent.click(within(picker).getByRole('button', { name: responderName }));
  advance(durationSeconds);
}

describe('ClinicalPanel — lock & hidden findings (§19)', () => {
  it('is locked before patient contact', () => {
    renderClinical(false);
    expect(screen.getByText(/clinical actions are locked/i)).toBeInTheDocument();
    expect(screen.queryByText('Patient Status')).toBeNull();
  });

  it('unlocks the sections once patient contact is established', () => {
    renderClinical(true);
    expect(screen.getByText('Patient Status')).toBeInTheDocument();
    expect(screen.getByText('Vital Signs')).toBeInTheDocument();
  });

  it('keeps vital signs hidden until the task completes, then reveals them', () => {
    const { advance } = renderClinical(true);
    expect(screen.queryByText('148/88')).toBeNull();
    performAction(/obtain vital signs/i, 'Partner Ron', 60, advance);
    expect(screen.getByText('148/88')).toBeInTheDocument();
  });

  it('initial assessment reveals only primary findings, not interview history', () => {
    const { advance } = renderClinical(true);
    performAction(/perform initial assessment/i, 'Partner Ron', 60, advance);
    expect(screen.getByText(/awake but pale/i)).toBeInTheDocument();
    // History/medications stay hidden until the interview is done.
    expect(screen.queryByText(/atrial fibrillation and high blood pressure/i)).toBeNull();
  });

  it('a focused exam reveals only the selected region', () => {
    const { advance } = renderClinical(true);
    // Default region is extremities.
    performAction(/examine extremities/i, 'Partner Ron', 45, advance);
    expect(screen.getByText(/right hip painful with movement/i)).toBeInTheDocument();
    expect(screen.queryByText(/soft, non-tender/i)).toBeNull(); // abdomen not examined
  });

  it('interview findings carry source labels', () => {
    const { advance } = renderClinical(true);
    performAction(/interview the patient/i, 'Partner Ron', 60, advance);
    expect(screen.getAllByText(/Patient reported/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Family reported/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe('ClinicalPanel — equipment gating (§19)', () => {
  it('cannot apply the monitor while it is on Medic 3, and says so', () => {
    renderClinical(true, []);
    expect(screen.getAllByText('Equipment Required').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /apply cardiac monitor/i }));
    expect(screen.getByText(/Cardiac Monitor is still on Medic 3/i)).toBeInTheDocument();
  });

  it('can apply the monitor once it is on scene, and reveals the rhythm', () => {
    const { advance } = renderClinical(true, ['cardiac_monitor']);
    performAction(/apply cardiac monitor/i, 'Partner Ron', 45, advance);
    expect(screen.getByText(/atrial fibrillation/i)).toBeInTheDocument();
  });
});

describe('ClinicalPanel — crew integration & reasoning (§19)', () => {
  it('one responder cannot perform two clinical tasks at once', () => {
    renderClinical(true);
    fireEvent.click(screen.getByRole('button', { name: /obtain vital signs/i }));
    fireEvent.click(within(screen.getByLabelText('Choose who performs this')).getByRole('button', { name: 'Partner Ron' }));
    // Now try the interview — Partner Ron is occupied and shouldn't be offered.
    fireEvent.click(screen.getByRole('button', { name: /interview the patient/i }));
    const picker = screen.getByLabelText('Choose who performs this');
    expect(within(picker).queryByRole('button', { name: 'Partner Ron' })).toBeNull();
  });

  it('lets the learner revise the working differential', () => {
    renderClinical(true);
    fireEvent.click(screen.getByRole('button', { name: /Move Syncope from a cardiac cause up/i }));
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')[0].textContent).toMatch(/syncope/i);
  });

  it('shows deterioration only on reassessment', () => {
    const fast: ClinicalModel = { ...bls01Clinical, deteriorationAtSecond: 2 };
    const { advance } = renderClinical(true, [], fast);
    advance(2); // deterioration occurs internally
    expect(screen.queryByText(/more lightheaded/i)).toBeNull(); // not shown until reassessed
    performAction(/reassess the patient/i, 'Partner Ron', 60, advance);
    expect(screen.getByText(/more lightheaded/i)).toBeInTheDocument();
  });

  it('never shows a numerical score or a correct-answer indicator', () => {
    const { container } = renderClinical(true);
    expect(container.textContent ?? '').not.toMatch(/\bscore\b|percentage|\bcorrect\b|pass\/fail/i);
  });
});
