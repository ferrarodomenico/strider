import { RawTraceCountBucket } from '@app/core/models/raw-dtos.model';
import { TraceCountBucket } from '@app/core/models/trace-count.model';

export const mapTraceCountBucket = (raw: RawTraceCountBucket): TraceCountBucket => ({
  startTime: raw.start_time,
  count: raw.count,
});

export const mapTraceCountBuckets = (rows: RawTraceCountBucket[] | null): TraceCountBucket[] =>
  (rows ?? []).map(mapTraceCountBucket);
