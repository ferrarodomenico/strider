import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import { Direction, OrderByField } from '@app/core/models/view.types';
import { rfc3339ToEpochMs } from './datetime.util';

export type ListRow = TraceSummary | SpanSummary;

/** Identity of a row in the list: the trace for trace summaries, trace + span for spans. */
export const rowKey = (row: ListRow): string =>
  'spanId' in row ? `${row.traceId}:${row.spanId}` : row.traceId;

/** Highest ts among rows; 0 when there are none. */
export function maxTs(rows: readonly ListRow[]): number {
  let max = 0;
  for (const row of rows) if (row.ts > max) max = row.ts;
  return max;
}

/**
 * The applied filter narrowed to rows ingested at or after sinceTs.
 *
 * `>=` rather than `>`: ts has second resolution, so a flush later in the same second as
 * the previous fetch would be missed by `>`. Rows read twice are deduped by mergeFresh.
 * A leading WHERE is stripped so the filter can be wrapped in parentheses.
 */
export function freshCondition(condition: string, sinceTs: number): string {
  const tsClause = `ts >= ${sinceTs}`;
  const base = condition.trim().replace(/^WHERE\s+/i, '');
  return base ? `(${base}) AND ${tsClause}` : tsClause;
}

/**
 * Adds fresh rows to index, keyed by rowKey. When a key is already present the row with
 * the higher ts survives; on a tie the fresh row wins, as it was read later. Mutates index.
 */
export function mergeFresh<T extends ListRow>(index: Map<string, T>, fresh: readonly T[]): void {
  for (const row of fresh) {
    const key = rowKey(row);
    const existing = index.get(key);
    if (!existing || row.ts >= existing.ts) index.set(key, row);
  }
}

function sortValue(row: ListRow, orderBy: OrderByField): number {
  switch (orderBy) {
    case 'start_time':
      return rfc3339ToEpochMs(row.startTime);
    case 'duration_ns':
      return row.durationNs;
    case 'span_count':
      return 'spanCount' in row ? row.spanCount : 0;
  }
}

/** Returns rows as a new array, in the order the backend's ORDER BY would produce. */
export function sortRows<T extends ListRow>(
  rows: Iterable<T>,
  orderBy: OrderByField,
  direction: Direction,
): T[] {
  const sign = direction === 'ASC' ? 1 : -1;
  return [...rows].sort((a, b) => sign * (sortValue(a, orderBy) - sortValue(b, orderBy)));
}
