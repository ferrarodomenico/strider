export interface RawTraceSummary {
  trace_id: string;
  root_name: string;
  service_name: string;
  start_time: string;
  duration_ns: number;
  span_count: number;
}

export interface RawSpanSummary {
  trace_id: string;
  span_id: string;
  service_name: string;
  name: string;
  kind: number;
  start_time: string;
  duration_ns: number;
  status_code: number;
}

export interface RawSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  service_name: string;
  name: string;
  kind: number;
  start_time: string;
  duration_ns: number;
  status_code: number;
  status_message: string;
  attributes: Record<string, string> | null;
  resource_attributes: Record<string, string> | null;
}

export interface RawSpanNode {
  Span: RawSpan;
  SubSpans: RawSpanNode[] | null;
}

export interface RawTraceDetail {
  TraceId: string;
  RootName: string;
  ServiceName: string;
  StartTime: string;
  DurationNs: number;
  Roots: RawSpanNode[] | null;
}

export interface RawTraceCountBucket {
  start_time: string;
  count: number;
}
