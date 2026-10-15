export interface SpanSummary {
  traceId: string;
  spanId: string;
  serviceName: string;
  name: string;
  kind: number;
  startTime: string;
  durationNs: number;
  statusCode: number;
}
