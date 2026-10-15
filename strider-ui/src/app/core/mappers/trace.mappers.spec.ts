import {
  RawSpan,
  RawSpanNode,
  RawSpanSummary,
  RawTraceDetail,
  RawTraceSummary,
} from '@app/core/models/raw-dtos.model';
import {
  mapSpan,
  mapSpanNode,
  mapSpanSummary,
  mapTraceDetail,
  mapTraceSummary,
} from './trace.mappers';

// AC-9: Mappers normalize mixed-case raw DTOs to clean camelCase models

const rawTraceSummary: RawTraceSummary = {
  trace_id: 'abc123',
  root_name: 'HTTP GET /api',
  service_name: 'api-gateway',
  start_time: '2024-01-15T10:00:00Z',
  duration_ns: 42_100_000,
  span_count: 12,
};

const rawSpanSummary: RawSpanSummary = {
  trace_id: 'abc123',
  span_id: 'span1',
  service_name: 'api-gateway',
  name: 'HTTP GET /api',
  kind: 2,
  start_time: '2024-01-15T10:00:00Z',
  duration_ns: 42_100_000,
  status_code: 0,
};

const rawSpan: RawSpan = {
  trace_id: 'abc123',
  span_id: 'span1',
  parent_span_id: 'parent1',
  service_name: 'api-gateway',
  name: 'HTTP GET /api',
  kind: 2,
  start_time: '2024-01-15T10:00:00Z',
  duration_ns: 42_100_000,
  status_code: 0,
  status_message: 'OK',
  attributes: { 'http.method': 'GET', 'http.url': '/api' },
  resource_attributes: { 'service.name': 'api-gateway' },
};

describe('mapTraceSummary', () => {
  it('maps all snake_case fields to camelCase', () => {
    const result = mapTraceSummary(rawTraceSummary);
    expect(result.traceId).toBe('abc123');
    expect(result.rootName).toBe('HTTP GET /api');
    expect(result.serviceName).toBe('api-gateway');
    expect(result.startTime).toBe('2024-01-15T10:00:00Z');
    expect(result.durationNs).toBe(42_100_000);
    expect(result.spanCount).toBe(12);
  });
});

describe('mapSpanSummary', () => {
  it('maps all snake_case fields to camelCase', () => {
    const result = mapSpanSummary(rawSpanSummary);
    expect(result.traceId).toBe('abc123');
    expect(result.spanId).toBe('span1');
    expect(result.serviceName).toBe('api-gateway');
    expect(result.name).toBe('HTTP GET /api');
    expect(result.kind).toBe(2);
    expect(result.startTime).toBe('2024-01-15T10:00:00Z');
    expect(result.durationNs).toBe(42_100_000);
    expect(result.statusCode).toBe(0);
  });
});

describe('mapSpan', () => {
  it('maps all snake_case span fields to camelCase', () => {
    const result = mapSpan(rawSpan);
    expect(result.traceId).toBe('abc123');
    expect(result.spanId).toBe('span1');
    expect(result.parentSpanId).toBe('parent1');
    expect(result.serviceName).toBe('api-gateway');
    expect(result.name).toBe('HTTP GET /api');
    expect(result.kind).toBe(2);
    expect(result.startTime).toBe('2024-01-15T10:00:00Z');
    expect(result.durationNs).toBe(42_100_000);
    expect(result.statusCode).toBe(0);
    expect(result.statusMessage).toBe('OK');
  });

  it('maps non-null attributes', () => {
    const result = mapSpan(rawSpan);
    expect(result.attributes['http.method']).toBe('GET');
    expect(result.resourceAttributes['service.name']).toBe('api-gateway');
  });

  it('handles null attributes → empty object', () => {
    const result = mapSpan({ ...rawSpan, attributes: null });
    expect(result.attributes).toEqual({});
  });

  it('handles null resource_attributes → empty object', () => {
    const result = mapSpan({ ...rawSpan, resource_attributes: null });
    expect(result.resourceAttributes).toEqual({});
  });

  it('handles null status_message → empty string', () => {
    const result = mapSpan({ ...rawSpan, status_message: null as unknown as string });
    expect(result.statusMessage).toBe('');
  });
});

describe('mapSpanNode', () => {
  const rawSpanNode: RawSpanNode = {
    Span: rawSpan,
    SubSpans: null,
  };

  it('maps PascalCase Span field', () => {
    const result = mapSpanNode(rawSpanNode);
    expect(result.span.spanId).toBe('span1');
  });

  it('handles null SubSpans → empty array (leaf node)', () => {
    const result = mapSpanNode({ ...rawSpanNode, SubSpans: null });
    expect(result.subSpans).toEqual([]);
  });

  it('recursively maps SubSpans', () => {
    const child: RawSpanNode = { Span: { ...rawSpan, span_id: 'child1' }, SubSpans: null };
    const result = mapSpanNode({ ...rawSpanNode, SubSpans: [child] });
    expect(result.subSpans).toHaveLength(1);
    expect(result.subSpans[0].span.spanId).toBe('child1');
  });
});

describe('mapTraceDetail', () => {
  const rawTraceDetail: RawTraceDetail = {
    TraceId: 'trace1',
    RootName: 'root-op',
    ServiceName: 'my-service',
    StartTime: '2024-01-15T10:00:00Z',
    DurationNs: 1_500_000_000,
    Roots: [{ Span: rawSpan, SubSpans: null }],
  };

  it('maps PascalCase outer keys to camelCase', () => {
    const result = mapTraceDetail(rawTraceDetail);
    expect(result.traceId).toBe('trace1');
    expect(result.rootName).toBe('root-op');
    expect(result.serviceName).toBe('my-service');
    expect(result.startTime).toBe('2024-01-15T10:00:00Z');
    expect(result.durationNs).toBe(1_500_000_000);
  });

  it('maps Roots array', () => {
    const result = mapTraceDetail(rawTraceDetail);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].span.spanId).toBe('span1');
  });

  it('handles null Roots → empty array (forest edge case)', () => {
    const result = mapTraceDetail({ ...rawTraceDetail, Roots: null });
    expect(result.roots).toEqual([]);
  });

  it('handles multiple roots (forest)', () => {
    const root2Span: RawSpan = { ...rawSpan, span_id: 'span2' };
    const result = mapTraceDetail({
      ...rawTraceDetail,
      Roots: [
        { Span: rawSpan, SubSpans: null },
        { Span: root2Span, SubSpans: null },
      ],
    });
    expect(result.roots).toHaveLength(2);
  });
});
