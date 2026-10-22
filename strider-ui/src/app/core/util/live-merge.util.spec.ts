import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import { freshCondition, ListRow, maxTs, mergeFresh, rowKey, sortRows } from './live-merge.util';

const trace = (traceId: string, patch: Partial<TraceSummary> = {}): TraceSummary => ({
  traceId,
  rootName: 'GET /api',
  serviceName: 'frontend',
  startTime: '2024-01-01T00:00:00Z',
  durationNs: 1_000,
  spanCount: 1,
  ts: 100,
  ...patch,
});

const span = (traceId: string, spanId: string, patch: Partial<SpanSummary> = {}): SpanSummary => ({
  traceId,
  spanId,
  serviceName: 'frontend',
  name: 'HTTP GET',
  kind: 1,
  startTime: '2024-01-01T00:00:00Z',
  durationNs: 1_000,
  statusCode: 0,
  ts: 100,
  ...patch,
});

describe('rowKey', () => {
  it('uses the trace id for trace summaries', () => {
    expect(rowKey(trace('t1'))).toBe('t1');
  });

  it('uses trace id and span id for spans', () => {
    expect(rowKey(span('t1', 's1'))).toBe('t1:s1');
  });
});

describe('maxTs', () => {
  it('returns 0 for no rows', () => {
    expect(maxTs([])).toBe(0);
  });

  it('returns the highest ts, wherever it is in the list', () => {
    expect(maxTs([trace('a', { ts: 105 }), trace('b', { ts: 120 }), trace('c', { ts: 110 })])).toBe(
      120,
    );
  });
});

describe('freshCondition', () => {
  it('is only the ts clause when there is no filter', () => {
    expect(freshCondition('', 42)).toBe('ts >= 42');
    expect(freshCondition('   ', 42)).toBe('ts >= 42');
  });

  it('wraps the filter in parentheses so OR keeps its meaning', () => {
    expect(freshCondition('a = 1 OR b = 2', 42)).toBe('(a = 1 OR b = 2) AND ts >= 42');
  });

  it('strips a leading WHERE, whatever its case', () => {
    expect(freshCondition("WHERE service_name = 'api'", 7)).toBe(
      "(service_name = 'api') AND ts >= 7",
    );
    expect(freshCondition("  where service_name = 'api'", 7)).toBe(
      "(service_name = 'api') AND ts >= 7",
    );
  });
});

describe('mergeFresh', () => {
  it('adds rows with new keys', () => {
    const index = new Map<string, ListRow>([['a', trace('a')]]);
    mergeFresh(index, [trace('b')]);
    expect([...index.keys()]).toEqual(['a', 'b']);
  });

  it('replaces an existing row with a fresher one', () => {
    const index = new Map<string, ListRow>([['a', trace('a', { ts: 100, spanCount: 1 })]]);
    mergeFresh(index, [trace('a', { ts: 110, spanCount: 4 })]);
    expect(index.size).toBe(1);
    expect((index.get('a') as TraceSummary).spanCount).toBe(4);
  });

  it('keeps the existing row when the fetched one is older', () => {
    const index = new Map<string, ListRow>([['a', trace('a', { ts: 110, spanCount: 4 })]]);
    mergeFresh(index, [trace('a', { ts: 100, spanCount: 1 })]);
    expect((index.get('a') as TraceSummary).spanCount).toBe(4);
  });

  it('prefers the fetched row on a ts tie', () => {
    const index = new Map<string, ListRow>([['a', trace('a', { ts: 100, spanCount: 1 })]]);
    mergeFresh(index, [trace('a', { ts: 100, spanCount: 2 })]);
    expect((index.get('a') as TraceSummary).spanCount).toBe(2);
  });

  it('keeps spans of the same trace apart', () => {
    const index = new Map<string, ListRow>();
    mergeFresh(index, [span('t1', 's1'), span('t1', 's2')]);
    expect(index.size).toBe(2);
  });
});

describe('sortRows', () => {
  const early = trace('early', {
    startTime: '2024-01-01T00:00:00Z',
    durationNs: 300,
    spanCount: 2,
  });
  const late = trace('late', { startTime: '2024-01-01T00:00:05Z', durationNs: 100, spanCount: 9 });

  it('sorts by start_time', () => {
    expect(sortRows([early, late], 'start_time', 'DESC').map((r) => r.traceId)).toEqual([
      'late',
      'early',
    ]);
    expect(sortRows([late, early], 'start_time', 'ASC').map((r) => r.traceId)).toEqual([
      'early',
      'late',
    ]);
  });

  it('sorts by duration_ns', () => {
    expect(sortRows([late, early], 'duration_ns', 'DESC').map((r) => r.traceId)).toEqual([
      'early',
      'late',
    ]);
  });

  it('sorts by span_count', () => {
    expect(sortRows([early, late], 'span_count', 'DESC').map((r) => r.traceId)).toEqual([
      'late',
      'early',
    ]);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = [early, late];
    const sorted = sortRows(input, 'start_time', 'DESC');
    expect(sorted).not.toBe(input);
    expect(input.map((r) => r.traceId)).toEqual(['early', 'late']);
  });
});
