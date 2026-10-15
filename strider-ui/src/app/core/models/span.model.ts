export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  serviceName: string;
  name: string;
  kind: number;
  startTime: string;
  durationNs: number;
  statusCode: number;
  statusMessage: string;
  attributes: Record<string, string>;
  resourceAttributes: Record<string, string>;
}
