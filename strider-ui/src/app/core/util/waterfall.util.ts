import { Span } from '@app/core/models/span.model';
import { SpanNode, TraceDetail, WaterfallRow } from '@app/core/models/trace-detail.model';
import { rfc3339ToEpochMs } from './datetime.util';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeGeometry(
  span: Span,
  trace: TraceDetail,
): { offsetPct: number; widthPct: number } {
  if (trace.durationNs <= 0) return { offsetPct: 0, widthPct: 0 };

  const traceStartMs = rfc3339ToEpochMs(trace.startTime);
  const spanStartMs = rfc3339ToEpochMs(span.startTime);
  const traceDurMs = trace.durationNs / 1_000_000;

  const offsetPct = clamp(((spanStartMs - traceStartMs) / traceDurMs) * 100, 0, 100);
  const widthPct = clamp((span.durationNs / trace.durationNs) * 100, 0, 100);

  return { offsetPct, widthPct };
}

function flattenNode(
  node: SpanNode,
  depth: number,
  trace: TraceDetail,
  collapsed: ReadonlySet<string>,
  result: WaterfallRow[],
): void {
  const { offsetPct, widthPct } = computeGeometry(node.span, trace);
  result.push({
    span: node.span,
    depth,
    hasChildren: node.subSpans.length > 0,
    collapsed: collapsed.has(node.span.spanId),
    offsetPct,
    widthPct,
  });

  if (!collapsed.has(node.span.spanId)) {
    for (const child of node.subSpans) {
      flattenNode(child, depth + 1, trace, collapsed, result);
    }
  }
}

export function flattenForest(trace: TraceDetail, collapsed: ReadonlySet<string>): WaterfallRow[] {
  const sortedRoots = [...trace.roots].sort(
    (a, b) => rfc3339ToEpochMs(a.span.startTime) - rfc3339ToEpochMs(b.span.startTime),
  );

  const rows: WaterfallRow[] = [];
  for (const root of sortedRoots) {
    flattenNode(root, 0, trace, collapsed, rows);
  }
  return rows;
}

export function findSpan(roots: readonly SpanNode[], spanId: string): Span | null {
  for (const root of roots) {
    const found = findSpanInNode(root, spanId);
    if (found) return found;
  }
  return null;
}

function findSpanInNode(node: SpanNode, spanId: string): Span | null {
  if (node.span.spanId === spanId) return node.span;
  for (const child of node.subSpans) {
    const found = findSpanInNode(child, spanId);
    if (found) return found;
  }
  return null;
}

export function collectAncestorIds(roots: readonly SpanNode[], spanId: string): string[] {
  const ancestors: string[] = [];
  for (const root of roots) {
    if (collectAncestorsFromNode(root, spanId, ancestors)) return ancestors;
  }
  return [];
}

function collectAncestorsFromNode(node: SpanNode, spanId: string, ancestors: string[]): boolean {
  if (node.span.spanId === spanId) return true;

  for (const child of node.subSpans) {
    if (collectAncestorsFromNode(child, spanId, ancestors)) {
      ancestors.push(node.span.spanId);
      return true;
    }
  }
  return false;
}
