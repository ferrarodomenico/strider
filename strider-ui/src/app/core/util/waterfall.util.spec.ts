import { Span } from '@app/core/models/span.model';
import { SpanNode, TraceDetail } from '@app/core/models/trace-detail.model';
import {
  collectAncestorIds,
  computeGeometry,
  findSpan,
  flattenForest,
} from './waterfall.util';

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    traceId: 'trace1',
    spanId: 'span1',
    parentSpanId: '',
    serviceName: 'svc',
    name: 'op',
    kind: 1,
    startTime: '2024-01-01T00:00:00.000Z',
    durationNs: 1_000_000_000,
    statusCode: 0,
    statusMessage: '',
    attributes: {},
    resourceAttributes: {},
    ...overrides,
  };
}

function makeTrace(overrides: Partial<TraceDetail> = {}): TraceDetail {
  return {
    traceId: 'trace1',
    rootName: 'root',
    serviceName: 'svc',
    startTime: '2024-01-01T00:00:00.000Z',
    durationNs: 2_000_000_000,
    roots: [],
    ...overrides,
  };
}

function makeNode(span: Span, subSpans: SpanNode[] = []): SpanNode {
  return { span, subSpans };
}

// AC-8 #41/#42: computeGeometry
describe('computeGeometry', () => {
  it('returns {0,0} when trace.durationNs is 0 (division-by-zero guard)', () => {
    const trace = makeTrace({ durationNs: 0 });
    const span = makeSpan();
    expect(computeGeometry(span, trace)).toEqual({ offsetPct: 0, widthPct: 0 });
  });

  it('returns {0,0} when trace.durationNs is negative', () => {
    const trace = makeTrace({ durationNs: -1 });
    const span = makeSpan();
    expect(computeGeometry(span, trace)).toEqual({ offsetPct: 0, widthPct: 0 });
  });

  it('returns offsetPct=0 when span starts at same time as trace', () => {
    const trace = makeTrace({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 1_000_000_000 });
    const span = makeSpan({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 500_000_000 });
    const geo = computeGeometry(span, trace);
    expect(geo.offsetPct).toBeCloseTo(0, 5);
    expect(geo.widthPct).toBeCloseTo(50, 1);
  });

  it('computes offsetPct correctly when span starts midway through trace', () => {
    // Trace: starts at T, duration 1000ms
    // Span: starts at T+500ms, duration 200ms
    // offset = 500/1000 * 100 = 50%; width = 200/1000 * 100 = 20%
    const trace = makeTrace({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 1_000_000_000 });
    const span = makeSpan({ startTime: '2024-01-01T00:00:00.500Z', durationNs: 200_000_000 });
    const geo = computeGeometry(span, trace);
    expect(geo.offsetPct).toBeCloseTo(50, 1);
    expect(geo.widthPct).toBeCloseTo(20, 1);
  });

  it('clamps offsetPct to 0 when span starts before trace (should not happen but defensive)', () => {
    const trace = makeTrace({ startTime: '2024-01-01T00:00:01.000Z', durationNs: 1_000_000_000 });
    const span = makeSpan({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 100_000_000 });
    const geo = computeGeometry(span, trace);
    expect(geo.offsetPct).toBeGreaterThanOrEqual(0);
  });

  it('clamps widthPct to 100 when span is longer than trace', () => {
    const trace = makeTrace({ durationNs: 1_000_000_000 });
    const span = makeSpan({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 5_000_000_000 });
    const geo = computeGeometry(span, trace);
    expect(geo.widthPct).toBeLessThanOrEqual(100);
  });

  it('computes widthPct=100 for a span covering the full trace duration', () => {
    const trace = makeTrace({ durationNs: 1_000_000_000 });
    const span = makeSpan({ startTime: '2024-01-01T00:00:00.000Z', durationNs: 1_000_000_000 });
    const geo = computeGeometry(span, trace);
    expect(geo.widthPct).toBeCloseTo(100, 1);
  });
});

// AC-9 #45/#47: flattenForest
describe('flattenForest', () => {
  const collapsed = new Set<string>();

  it('returns [] for a trace with no roots', () => {
    const trace = makeTrace({ roots: [] });
    expect(flattenForest(trace, collapsed)).toEqual([]);
  });

  it('returns one row for a single root span (leaf)', () => {
    const span = makeSpan({ spanId: 'root1' });
    const trace = makeTrace({ roots: [makeNode(span)] });
    const rows = flattenForest(trace, collapsed);
    expect(rows).toHaveLength(1);
    expect(rows[0].span.spanId).toBe('root1');
    expect(rows[0].depth).toBe(0);
    expect(rows[0].hasChildren).toBe(false);
  });

  it('places children after parent with depth incremented', () => {
    const root = makeSpan({ spanId: 'root' });
    const child = makeSpan({ spanId: 'child', parentSpanId: 'root' });
    const trace = makeTrace({ roots: [makeNode(root, [makeNode(child)])] });
    const rows = flattenForest(trace, collapsed);
    expect(rows).toHaveLength(2);
    expect(rows[0].span.spanId).toBe('root');
    expect(rows[0].depth).toBe(0);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[1].span.spanId).toBe('child');
    expect(rows[1].depth).toBe(1);
  });

  it('skips children of a collapsed node', () => {
    const root = makeSpan({ spanId: 'root' });
    const child = makeSpan({ spanId: 'child', parentSpanId: 'root' });
    const trace = makeTrace({ roots: [makeNode(root, [makeNode(child)])] });
    const collapsedSet = new Set(['root']);
    const rows = flattenForest(trace, collapsedSet);
    expect(rows).toHaveLength(1);
    expect(rows[0].span.spanId).toBe('root');
    expect(rows[0].collapsed).toBe(true);
  });

  // AC-9 #47: Multiple roots sorted by start_time ascending
  it('sorts multiple roots by start_time ascending', () => {
    const root1 = makeSpan({ spanId: 'later', startTime: '2024-01-01T00:00:02.000Z' });
    const root2 = makeSpan({ spanId: 'earlier', startTime: '2024-01-01T00:00:01.000Z' });
    const trace = makeTrace({ roots: [makeNode(root1), makeNode(root2)] });
    const rows = flattenForest(trace, collapsed);
    expect(rows[0].span.spanId).toBe('earlier');
    expect(rows[1].span.spanId).toBe('later');
  });

  it('traverses DFS pre-order (parent before children)', () => {
    const root = makeSpan({ spanId: 'A' });
    const child1 = makeSpan({ spanId: 'B', parentSpanId: 'A' });
    const child2 = makeSpan({ spanId: 'C', parentSpanId: 'A' });
    const grandchild = makeSpan({ spanId: 'D', parentSpanId: 'B' });
    const trace = makeTrace({
      roots: [makeNode(root, [makeNode(child1, [makeNode(grandchild)]), makeNode(child2)])],
    });
    const ids = flattenForest(trace, collapsed).map((r) => r.span.spanId);
    expect(ids).toEqual(['A', 'B', 'D', 'C']);
  });
});

// AC-9 #49/#53: findSpan
describe('findSpan', () => {
  it('returns null when roots is empty', () => {
    expect(findSpan([], 'x')).toBeNull();
  });

  it('finds a root span', () => {
    const span = makeSpan({ spanId: 'root1' });
    expect(findSpan([makeNode(span)], 'root1')).toBe(span);
  });

  it('finds a nested span', () => {
    const root = makeSpan({ spanId: 'root' });
    const child = makeSpan({ spanId: 'child' });
    const grandchild = makeSpan({ spanId: 'grand' });
    const roots = [makeNode(root, [makeNode(child, [makeNode(grandchild)])])];
    expect(findSpan(roots, 'grand')).toBe(grandchild);
  });

  it('returns null when span is not found', () => {
    const span = makeSpan({ spanId: 'root1' });
    expect(findSpan([makeNode(span)], 'nonexistent')).toBeNull();
  });
});

// AC-9: collectAncestorIds (used by selectSpan to expand collapsed parents)
describe('collectAncestorIds', () => {
  it('returns [] for a root span (no ancestors)', () => {
    const span = makeSpan({ spanId: 'root' });
    expect(collectAncestorIds([makeNode(span)], 'root')).toEqual([]);
  });

  it('returns [rootId] for a direct child of root', () => {
    const root = makeSpan({ spanId: 'root' });
    const child = makeSpan({ spanId: 'child' });
    const roots = [makeNode(root, [makeNode(child)])];
    expect(collectAncestorIds(roots, 'child')).toEqual(['root']);
  });

  it('returns ancestor chain for a grandchild', () => {
    const root = makeSpan({ spanId: 'root' });
    const child = makeSpan({ spanId: 'child' });
    const grandchild = makeSpan({ spanId: 'grand' });
    const roots = [makeNode(root, [makeNode(child, [makeNode(grandchild)])])];
    // bottom-up order: child first, root second
    expect(collectAncestorIds(roots, 'grand')).toEqual(['child', 'root']);
  });

  it('returns [] when span is not found', () => {
    const span = makeSpan({ spanId: 'root' });
    expect(collectAncestorIds([makeNode(span)], 'missing')).toEqual([]);
  });
});
