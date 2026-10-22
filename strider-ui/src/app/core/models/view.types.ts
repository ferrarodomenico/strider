export type ListMode = 'traces' | 'spans';
export type ViewMode = ListMode | 'stats';
export type IntervalUnit = 'minute' | 'hour' | 'day';
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type Direction = 'ASC' | 'DESC';
export type OrderByField = 'start_time' | 'duration_ns' | 'span_count';
export type FilterMode = 'raw' | 'builder';
export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';
export type Operator = '=' | '!=' | '<' | '>' | 'LIKE';
export type BuilderField =
  | 'service_name'
  | 'root_name'
  | 'name'
  | 'start_time'
  | 'duration_ns'
  | 'span_count'
  | 'status_code'
  | 'kind';
export type RelativeRange = '15m' | '1h' | '24h' | '7d';
export type TimeMode = 'relative' | 'absolute';
/** Max rows requested from list endpoints; `null` means no limit. */
export type ResultLimit = 100 | 1000 | 10000 | null;
