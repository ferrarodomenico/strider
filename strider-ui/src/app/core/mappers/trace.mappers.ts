import { RawSpan, RawSpanNode, RawSpanSummary, RawTraceDetail, RawTraceSummary } from '@app/core/models/raw-dtos.model';
import { Span } from '@app/core/models/span.model';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { SpanNode, TraceDetail } from '@app/core/models/trace-detail.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';

export const mapTraceSummary = (r: RawTraceSummary): TraceSummary => ({
  traceId: r.trace_id,
  rootName: r.root_name,
  serviceName: r.service_name,
  startTime: r.start_time,
  durationNs: r.duration_ns,
  spanCount: r.span_count,
});

export const mapSpanSummary = (r: RawSpanSummary): SpanSummary => ({
  traceId: r.trace_id,
  spanId: r.span_id,
  serviceName: r.service_name,
  name: r.name,
  kind: r.kind,
  startTime: r.start_time,
  durationNs: r.duration_ns,
  statusCode: r.status_code,
});

export const mapSpan = (r: RawSpan): Span => ({
  traceId: r.trace_id,
  spanId: r.span_id,
  parentSpanId: r.parent_span_id,
  serviceName: r.service_name,
  name: r.name,
  kind: r.kind,
  startTime: r.start_time,
  durationNs: r.duration_ns,
  statusCode: r.status_code,
  statusMessage: r.status_message ?? '',
  attributes: r.attributes ?? {},
  resourceAttributes: r.resource_attributes ?? {},
});

export const mapSpanNode = (r: RawSpanNode): SpanNode => ({
  span: mapSpan(r.Span),
  subSpans: (r.SubSpans ?? []).map(mapSpanNode),
});

export const mapTraceDetail = (r: RawTraceDetail): TraceDetail => ({
  traceId: r.TraceId,
  rootName: r.RootName,
  serviceName: r.ServiceName,
  startTime: r.StartTime,
  durationNs: r.DurationNs,
  roots: (r.Roots ?? []).map(mapSpanNode),
});
