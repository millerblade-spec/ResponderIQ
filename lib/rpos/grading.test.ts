import { describe, it, expect } from 'vitest';
import {
  REQUIRED_CONSECUTIVE_BLUE,
  RPOS_BANDS,
  bandFor,
  gradingWeightsFor,
  isMasteryBand,
  requiresFocusedDebrief,
  streakLabel,
} from './grading';
import { DEFAULT_SIMULATOR_CONFIG } from '@/lib/engine/config';

describe('RPOS grading bands', () => {
  it('uses the program’s own bands: BLUE 98–100, GREEN 95–97, YELLOW 90–94, RED below 90', () => {
    expect(bandFor(100).name).toBe('blue');
    expect(bandFor(98).name).toBe('blue');
    expect(bandFor(97).name).toBe('green');
    expect(bandFor(95).name).toBe('green');
    expect(bandFor(94).name).toBe('yellow');
    expect(bandFor(90).name).toBe('yellow');
    expect(bandFor(89).name).toBe('red');
    expect(bandFor(0).name).toBe('red');
  });

  it('is not the simulator’s own 75-to-pass scale — a passing BLS-01 run can still be RED here', () => {
    const simulatorPassing = DEFAULT_SIMULATOR_CONFIG.scoring.passingScore;
    expect(simulatorPassing).toBe(75);
    expect(bandFor(simulatorPassing).name).toBe('red');
  });

  it('covers 0–100 with no gaps and no overlaps', () => {
    for (let score = 0; score <= 100; score += 1) {
      const matches = RPOS_BANDS.filter((band) => score >= band.min && score <= band.max);
      expect(matches).toHaveLength(1);
    }
  });

  it('treats only BLUE as mastery', () => {
    expect(isMasteryBand('blue')).toBe(true);
    expect(isMasteryBand('green')).toBe(false);
    expect(isMasteryBand('yellow')).toBe(false);
    expect(isMasteryBand('red')).toBe(false);
  });

  it('requires a focused debrief for YELLOW and RED', () => {
    expect(requiresFocusedDebrief('yellow')).toBe(true);
    expect(requiresFocusedDebrief('red')).toBe(true);
    expect(requiresFocusedDebrief('green')).toBe(false);
    expect(requiresFocusedDebrief('blue')).toBe(false);
  });

  it('requires five consecutive BLUE cases for normal advancement', () => {
    expect(REQUIRED_CONSECUTIVE_BLUE).toBe(5);
  });

  it('states Level 1 weighting exactly, and no weighting at all for the other levels', () => {
    const weights = gradingWeightsFor(1);
    expect(weights?.map((w) => [w.key, w.percent])).toEqual([
      ['assessment', 45],
      ['protocol_treatment', 20],
      ['recognition_reasoning', 15],
      ['reassessment', 10],
      ['safety', 5],
      ['communication_operations', 5],
    ]);
    expect(weights?.reduce((sum, w) => sum + w.percent, 0)).toBe(100);
    // The prompts give weights for Level 1 only — the rest report nothing rather than a fabricated curve.
    for (const level of [2, 3, 4, 5, 6] as const) {
      expect(gradingWeightsFor(level)).toBeNull();
    }
  });
});

describe('mastery streak label', () => {
  it('reads as progress toward the requirement', () => {
    expect(streakLabel(0, 5)).toBe('0 of 5');
    expect(streakLabel(3, 5)).toBe('3 of 5');
    expect(streakLabel(5, 5)).toBe('5 of 5');
  });

  it('does not read as "10 of 5" once the streak runs past the requirement', () => {
    // The longer streak is real and worth showing; it just is not progress.
    expect(streakLabel(10, 5)).toBe('5 of 5 · 10 consecutive');
  });

  it('defaults to the program’s own requirement', () => {
    expect(streakLabel(2)).toBe(`2 of ${REQUIRED_CONSECUTIVE_BLUE}`);
  });
});
