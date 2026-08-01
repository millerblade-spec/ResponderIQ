import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SceneSafety } from './SceneSafety';
import { MissionClock, type TimeSource } from '@/lib/engine/missionClock';
import { bls01Scene, bls01SecurityScene } from '@/lib/scenarios/bls-01.dispatch';

class ManualTimeSource implements TimeSource {
  private t = 0;
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

function renderScene(config = bls01Scene) {
  const source = new ManualTimeSource();
  const clock = new MissionClock(source);
  clock.start();
  const utils = render(<SceneSafety config={config} clock={clock} />);
  const advance = (seconds: number) =>
    act(() => {
      source.advance(seconds * 1000);
      clock.tick();
    });
  return { ...utils, advance };
}

describe('SceneSafety — windshield & clinical lock (§15, §19)', () => {
  it('opens with the windshield assessment and clinical actions locked', () => {
    renderScene();
    expect(screen.getByText(/are we safe to enter/i)).toBeInTheDocument();
    // The new windshield content (fix #4): darkness, road condition, lawn,
    // debris/cans, and the group of people — all feeding "is the scene safe".
    expect(screen.getByText('Night')).toBeInTheDocument();
    expect(screen.getByText('Potholes')).toBeInTheDocument();
    expect(screen.getByText('Unkempt lawn')).toBeInTheDocument();
    expect(screen.getByText('Cans and litter in the yard')).toBeInTheDocument();
    expect(screen.getByText('Group of people near the entrance')).toBeInTheDocument();
    expect(screen.getByText(/clinical assessment stays locked/i)).toBeInTheDocument();
    // ABCs unknown before contact.
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Not established')).toBeInTheDocument();
  });

  it('asks the dark-scene lights question and reveals hidden hazards when lights go on (§17, fix #5)', () => {
    renderScene();
    expect(screen.getByText(/do you think we need to add scene lights/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /turn scene lights on/i }));
    expect(screen.getByText(/standing water/i)).toBeInTheDocument();
  });

  it('unlocks clinical only after Safe to Enter → equipment → stairs → floor read → contact (§19, fixes #6, #10)', () => {
    renderScene();
    fireEvent.click(screen.getByRole('button', { name: /^safe to enter$/i }));
    fireEvent.click(screen.getByRole('button', { name: /exit medic 3/i }));
    // Stepping out triggers Ron's equipment question (fix #6).
    expect(screen.getByText(/what do you want to bring in/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /stair chair/i }));
    fireEvent.click(screen.getByRole('button', { name: /bring these in/i }));
    expect(screen.queryByText(/clinical assessment is now available/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /head up the stairs/i }));
    // The floor read (fix #10): lighting and the open door, explained by the son.
    expect(screen.getByRole('button', { name: /check the hallway lighting/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /note the open door/i }));
    expect(screen.getByText(/didn’t shut it behind him/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /enter the apartment/i }));
    expect(screen.getByText(/clinical assessment is now available/i)).toBeInTheDocument();
    expect(screen.getByText('Established')).toBeInTheDocument();
  });
});

describe('SceneSafety — staging, police clearance & ballistic PPE (§16, §18)', () => {
  it('starts staged on a dispatch staging order and shows the ballistic prompt', () => {
    renderScene(bls01SecurityScene);
    expect(screen.getByText(/staged for law enforcement/i)).toBeInTheDocument();
    expect(screen.getByText(/this is a shooting scene/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /put on vests and helmets/i })).toBeInTheDocument();
    expect(screen.getByText(/ballistic protection does not make an unsecured scene safe/i)).toBeInTheDocument();
  });

  it('police arrive after 15s and secure the scene 10s later, clearing entry', () => {
    const { advance } = renderScene(bls01SecurityScene);
    expect(screen.getByText(/police responding/i)).toBeInTheDocument();
    advance(15);
    expect(screen.getByText(/police on scene/i)).toBeInTheDocument();
    expect(screen.queryByText(/clear to enter/i)).toBeNull();
    advance(10);
    expect(screen.getByText(/clear to enter/i)).toBeInTheDocument(); // "…the scene is secure. You're clear to enter."
    expect(screen.getByRole('button', { name: /exit medic 3/i })).toBeInTheDocument();
  });

  it('does not show a ballistic prompt on a non-security scene', () => {
    renderScene(bls01Scene);
    expect(screen.queryByRole('button', { name: /put on vests and helmets/i })).toBeNull();
  });
});
