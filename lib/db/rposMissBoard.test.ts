import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { query, resetPoolForTests } from './client';
import { listMissBoard, listMissBoardsForBadges, recordMisses, resolveMisses } from './rposMissBoard';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://responderiq:localdevonly@localhost:5432/responderiq_test';

const miss = (id: string, overrides: Partial<Parameters<typeof recordMisses>[0][number]> = {}) => ({
  id,
  badgeId: 'B-1234',
  category: 'safety' as const,
  subject: 'Scene safety',
  detail: 'Entered before clearance.',
  critical: true,
  sourceCaseId: 'case-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('rpos_miss_board (integration, real database)', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', TEST_DATABASE_URL));
  afterAll(() => {
    vi.unstubAllEnvs();
    resetPoolForTests();
  });
  beforeEach(async () => {
    await query('TRUNCATE rpos_miss_board');
  });

  it('records misses and reads them back', async () => {
    expect(await recordMisses([miss('case-1:scene_safety')])).toBe(1);
    const board = await listMissBoard('B-1234');
    expect(board).toHaveLength(1);
    expect(board[0].critical).toBe(true);
    expect(board[0].resolvedAt).toBeNull();
  });

  it('is idempotent by entry id — re-processing a case never duplicates its misses', async () => {
    await recordMisses([miss('case-1:scene_safety')]);
    expect(await recordMisses([miss('case-1:scene_safety')])).toBe(0);
    expect(await listMissBoard('B-1234')).toHaveLength(1);
  });

  it('resolves an open entry and records which case cleared it', async () => {
    await recordMisses([miss('case-1:scene_safety')]);
    expect(await resolveMisses([{ entryId: 'case-1:scene_safety', resolvedByCaseId: 'case-9' }])).toBe(1);
    const board = await listMissBoard('B-1234');
    expect(board[0].resolvedByCaseId).toBe('case-9');
    expect(board[0].resolvedAt).not.toBeNull();
  });

  it('never re-resolves an entry, so the original clearing case is kept', async () => {
    await recordMisses([miss('case-1:scene_safety')]);
    await resolveMisses([{ entryId: 'case-1:scene_safety', resolvedByCaseId: 'case-9' }]);
    expect(await resolveMisses([{ entryId: 'case-1:scene_safety', resolvedByCaseId: 'case-99' }])).toBe(0);
    expect((await listMissBoard('B-1234'))[0].resolvedByCaseId).toBe('case-9');
  });

  it('does not resurrect a resolved entry when the same miss id is recorded again', async () => {
    await recordMisses([miss('case-1:scene_safety')]);
    await resolveMisses([{ entryId: 'case-1:scene_safety', resolvedByCaseId: 'case-9' }]);
    await recordMisses([miss('case-1:scene_safety')]);
    expect((await listMissBoard('B-1234'))[0].resolvedAt).not.toBeNull();
  });

  it('lists open entries before resolved ones, criticals first', async () => {
    await recordMisses([
      miss('case-1:a', { critical: false, subject: 'Time management', category: 'operations' }),
      miss('case-1:b', { critical: true, subject: 'Scene safety' }),
      miss('case-1:c', { critical: true, subject: 'Windshield assessment' }),
    ]);
    await resolveMisses([{ entryId: 'case-1:c', resolvedByCaseId: 'case-9' }]);
    const board = await listMissBoard('B-1234');
    expect(board.map((entry) => entry.id)).toEqual(['case-1:b', 'case-1:a', 'case-1:c']);
  });

  it('batches boards for many badges, with empty arrays for badges that have none', async () => {
    await recordMisses([miss('case-1:a'), miss('case-2:b', { badgeId: 'B-2' })]);
    const boards = await listMissBoardsForBadges(['B-1234', 'B-2', 'B-nobody']);
    expect(boards.get('B-1234')).toHaveLength(1);
    expect(boards.get('B-2')).toHaveLength(1);
    expect(boards.get('B-nobody')).toEqual([]);
  });

  it('returns an empty batch without querying for an empty badge list', async () => {
    expect(await listMissBoardsForBadges([])).toEqual(new Map());
  });

  it('keeps learners separate', async () => {
    await recordMisses([miss('case-1:a')]);
    expect(await listMissBoard('B-other')).toEqual([]);
  });
});
