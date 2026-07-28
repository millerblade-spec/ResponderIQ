import { describe, it, expect } from 'vitest';
import {
  createInitialOpSimState,
  completeTone,
  toggleDifferentialSelection,
  reorderRanking,
  canFinalizeDifferential,
  finalizeDifferential,
  arriveOnScene,
  showEquipmentPrompt,
  toggleEquipment,
  confirmEquipment,
  equipmentAvailability,
  rankedTop,
} from './machine';
import { differentialTimerSeconds } from './difficulty';
import { EQUIPMENT_CATALOG } from './equipment';

const seed = () => createInitialOpSimState('bls-01', 'orientation');

/** Select ids in order, from the differential stage. */
function selectAll(state: ReturnType<typeof seed>, ids: string[]) {
  return ids.reduce((s, id) => toggleDifferentialSelection(s, id), state);
}

describe('opsim machine — dispatch & response (§7)', () => {
  it('starts in dispatch, Code 3 responding, tone not yet complete', () => {
    const s = seed();
    expect(s.stage).toBe('dispatch');
    expect(s.responseStatus).toBe('responding');
    expect(s.toneComplete).toBe(false);
    expect(s.differential.open).toBe(false);
  });

  it('opens the differential challenge once the dispatch tone completes (§8)', () => {
    const s = completeTone(seed());
    expect(s.toneComplete).toBe(true);
    expect(s.stage).toBe('differential');
    expect(s.differential.open).toBe(true);
  });

  it('stops beacons and goes ON SCENE on arrival (§7)', () => {
    const s = arriveOnScene(completeTone(seed()));
    expect(s.responseStatus).toBe('on_scene');
  });
});

describe('opsim machine — differential challenge (§8)', () => {
  it('requires a minimum of four selections before manual finalize is allowed', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c']);
    expect(canFinalizeDifferential(s)).toBe(false);
    // Manual finalize is blocked with only three.
    expect(finalizeDifferential(s, { timeout: false }).differential.finalized).toBe(false);

    s = toggleDifferentialSelection(s, 'd');
    expect(canFinalizeDifferential(s)).toBe(true);
  });

  it('allows more than four selections', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(s.differential.selected).toHaveLength(6);
    expect(canFinalizeDifferential(s)).toBe(true);
  });

  it('toggles a selection off, removing it from the ranking too', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c']);
    s = toggleDifferentialSelection(s, 'b');
    expect(s.differential.selected).toEqual(['a', 'c']);
    expect(s.differential.ranking).toEqual(['a', 'c']);
  });

  it('reorders the ranking up and down (keyboard equivalent of dragging)', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd']);
    s = reorderRanking(s, 'c', 'up'); // c moves above b
    expect(s.differential.ranking).toEqual(['a', 'c', 'b', 'd']);
    s = reorderRanking(s, 'c', 'down'); // back
    expect(s.differential.ranking).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not move the top item up or the bottom item down', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd']);
    expect(reorderRanking(s, 'a', 'up').differential.ranking).toEqual(['a', 'b', 'c', 'd']);
    expect(reorderRanking(s, 'd', 'down').differential.ranking).toEqual(['a', 'b', 'c', 'd']);
  });

  it('exposes the ranked top four; extra selections remain considered but unranked', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(rankedTop(s)).toEqual(['a', 'b', 'c', 'd']);
    expect(s.differential.selected.slice(4)).toEqual(['e', 'f']); // considered
  });

  it('finalizes by choice with four selections and records it was not a timeout', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd']);
    s = finalizeDifferential(s, { timeout: false });
    expect(s.differential.finalized).toBe(true);
    expect(s.differential.finalizedByTimeout).toBe(false);
    expect(s.differential.open).toBe(false);
    expect(s.stage).toBe('awaiting_equipment');
  });

  it('on timeout saves partial work even below the minimum, and marks it a timeout', () => {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b']); // only two — below the minimum
    s = finalizeDifferential(s, { timeout: true });
    expect(s.differential.finalized).toBe(true);
    expect(s.differential.finalizedByTimeout).toBe(true);
    expect(s.differential.selected).toEqual(['a', 'b']); // preserved, not discarded
    expect(s.stage).toBe('awaiting_equipment');
  });
});

describe('opsim differential timer resolves from approved config (§8)', () => {
  it('is 20 seconds at Orientation', () => {
    expect(differentialTimerSeconds('orientation')).toBe(20);
  });
  it('is 15 seconds above Orientation', () => {
    expect(differentialTimerSeconds('advanced')).toBe(15);
  });
});

describe('opsim machine — equipment selection (§9)', () => {
  function throughDifferential() {
    let s = completeTone(seed());
    s = selectAll(s, ['a', 'b', 'c', 'd']);
    return finalizeDifferential(s, { timeout: false });
  }

  it('shows Ron’s prompt and opens equipment only after the differential ends', () => {
    const before = throughDifferential();
    expect(before.equipment.promptShown).toBe(false);
    const s = showEquipmentPrompt(before);
    expect(s.equipment.promptShown).toBe(true);
    expect(s.equipment.open).toBe(true);
    expect(s.stage).toBe('equipment');
  });

  it('selected equipment is immediately on scene; everything else stays on Medic 3 for 45s retrieval', () => {
    let s = showEquipmentPrompt(throughDifferential());
    s = toggleEquipment(s, 'als_bag');
    s = toggleEquipment(s, 'cardiac_monitor');
    s = confirmEquipment(s);
    expect(s.stage).toBe('ready');

    const avail = equipmentAvailability(s, EQUIPMENT_CATALOG);
    expect(avail.onScene).toEqual(['als_bag', 'cardiac_monitor']);
    expect(avail.onMedic3).toContain('portable_suction');
    expect(avail.onScene).not.toContain('portable_suction');
    expect(avail.onMedic3).toHaveLength(EQUIPMENT_CATALOG.length - 2);
    expect(avail.retrievalSeconds).toBe(45);
  });
});
