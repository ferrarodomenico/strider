export interface TraceSummary {
  traceId: string;
  rootName: string;
  serviceName: string;
  startTime: string;
  durationNs: number;
  spanCount: number;
}
