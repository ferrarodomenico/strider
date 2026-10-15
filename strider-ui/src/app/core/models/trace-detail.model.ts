import { Span } from './span.model';

export interface SpanNode {
  span: Span;
  subSpans: SpanNode[];
}

export interface TraceDetail {
  traceId: string;
  rootName: string;
  serviceName: string;
  startTime: string;
  durationNs: number;
  roots: SpanNode[];
}

export interface WaterfallRow {
  span: Span;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  offsetPct: number;
  widthPct: number;
}
