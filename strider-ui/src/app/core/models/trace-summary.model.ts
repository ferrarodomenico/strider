export interface TraceSummary {
  traceId: string;
  rootName: string;
  serviceName: string;
  startTime: string;
  durationNs: number;
  spanCount: number;
  /** Ingestion time (Unix seconds) of the trace's latest spans. Used by live updates. */
  ts: number;
}
