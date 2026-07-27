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
    expect(screen.getByText('Dusk')).toBeInTheDocument();
    expect(screen.getByText(/clinical assessment stays locked/i)).toBeInTheDocument();
    // ABCs unknown before contact.
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Not established')).toBeInTheDocument();
  });

  it('prompts for scene lights and reveals hidden hazards when they are turned on (§17)', () => {
    renderScene();
    expect(screen.getByText(/want the scene lights on/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /turn scene lights on/i }));
    expect(screen.getByText(/standing water/i)).toBeInTheDocument();
  });

  it('unlocks clinical only after Safe to Enter → exit → patient contact (§19)', () => {
    renderScene();
    fireEvent.click(screen.getByRole('button', { name: /^safe to enter$/i }));
    fireEvent.click(screen.getByRole('button', { name: /exit medic 3/i }));
    fireEvent.click(screen.getByRole('button', { name: /establish patient contact/i }));
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
