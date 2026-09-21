import { query } from './client';
import type { MissBoardEntry, MissCategory } from '@/lib/rpos/types';

/**
 * Miss Board persistence.
 *
 * Recording is idempotent by entry id ('<case id>:<subject key>'), so
 * re-processing a case never duplicates its misses. Resolution is recorded as
 * a fact about history — which later case cleared the entry, and when — rather
 * than recomputed, because "retest old weaknesses later using different
 * presentations" is a claim about what actually happened.
 */

export interface MissBoardEntryInput {
  readonly id: string;
  readonly badgeId: string;
  readonly category: MissCategory;
  readonly subject: string;
  readonly detail: string;
  readonly critical: boolean;
  readonly sourceCaseId: string;
  /**
   * When the case that produced this miss ran — NOT when the row was written.
   * Resolution asks whether a LATER case retested the subject, so an entry
   * stamped with its insert time (which can be long after the case, since the
   * board is synced on read) would look newer than the very cases meant to
   * clear it, and could never be resolved.
   */
  readonly createdAt: string;
}

interface MissRow {
  readonly id: string;
  readonly category: string;
  readonly subject: string;
  readonly detail: string;
  readonly critical: boolean;
  readonly source_case_id: string;
  readonly created_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by_case_id: string | null;
}

function toEntry(row: MissRow): MissBoardEntry {
  return {
    id: row.id,
    category: row.category as MissCategory,
    subject: row.subject,
    detail: row.detail,
    critical: row.critical,
    sourceCaseId: row.source_case_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedByCaseId: row.resolved_by_case_id,
  };
}

const SELECT_COLUMNS =
  'id, category, subject, detail, critical, source_case_id, created_at, resolved_at, resolved_by_case_id';

/** Records misses from one case. Existing entries are left exactly as they are, resolved or not. */
export async function recordMisses(entries: readonly MissBoardEntryInput[]): Promise<number> {
  let inserted = 0;
  for (const entry of entries) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO rpos_miss_board (id, badge_id, category, subject, detail, critical, source_case_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        entry.id,
        entry.badgeId,
        entry.category,
        entry.subject,
        entry.detail,
        entry.critical,
        entry.sourceCaseId,
        entry.createdAt,
      ],
    );
    if (rows.length > 0) inserted += 1;
  }
  return inserted;
}

/** One learner's whole board, criticals first among open entries, then oldest first. */
export async function listMissBoard(badgeId: string): Promise<readonly MissBoardEntry[]> {
  const { rows } = await query<MissRow>(
    `SELECT ${SELECT_COLUMNS} FROM rpos_miss_board
      WHERE badge_id = $1
      ORDER BY resolved_at NULLS FIRST, critical DESC, created_at ASC`,
    [badgeId],
  );
  return rows.map(toEntry);
}

/** The same boards for many learners in one query, keyed by badge id. Badges with no entries come back empty, not missing. */
export async function listMissBoardsForBadges(
  badgeIds: readonly string[],
): Promise<ReadonlyMap<string, readonly MissBoardEntry[]>> {
  const byBadge = new Map<string, MissBoardEntry[]>(badgeIds.map((badgeId) => [badgeId, []]));
  if (badgeIds.length === 0) return byBadge;

  const { rows } = await query<MissRow & { badge_id: string }>(
    `SELECT ${SELECT_COLUMNS}, badge_id FROM rpos_miss_board
      WHERE badge_id = ANY($1)
      ORDER BY resolved_at NULLS FIRST, critical DESC, created_at ASC`,
    [badgeIds as string[]],
  );
  for (const row of rows) byBadge.get(row.badge_id)?.push(toEntry(row));
  return byBadge;
}

/** Marks entries resolved by a later case. Already-resolved entries keep their original resolution. */
export async function resolveMisses(
  resolutions: readonly { readonly entryId: string; readonly resolvedByCaseId: string }[],
): Promise<number> {
  let resolved = 0;
  for (const resolution of resolutions) {
    const { rows } = await query<{ id: string }>(
      `UPDATE rpos_miss_board
          SET resolved_at = now(), resolved_by_case_id = $2
        WHERE id = $1 AND resolved_at IS NULL
        RETURNING id`,
      [resolution.entryId, resolution.resolvedByCaseId],
    );
    if (rows.length > 0) resolved += 1;
  }
  return resolved;
}
