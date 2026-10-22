import { InjectionToken } from '@angular/core';
import { RelativeRange, ResultLimit } from '@app/core/models/view.types';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export const API_PATHS = {
  traces: '/traces',
  spans: '/spans',
  traceDetail: (id: string) => `/traces/${encodeURIComponent(id)}`,
  traceCount: '/traces/count',
  liveUpdates: '/live-updates',
} as const;

export const RESULT_LIMIT_OPTIONS: readonly ResultLimit[] = [100, 1000, 10000, null];
export const DEFAULT_RESULT_LIMIT: ResultLimit = null;
export const ROW_HEIGHT_PX = 40;
export const MIN_BAR_WIDTH_PX = 2;
export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** localStorage key holding the live updates checkbox state ('true' / 'false'). */
export const LIVE_UPDATES_STORAGE_KEY = 'strider.liveUpdates';
/** Quiet time after the last live update signal before fetching. */
export const LIVE_UPDATES_DEBOUNCE_MS = 2_000;
/** Longest wait between the first signal of a burst and the fetch, so constant ingest can't stall updates. */
export const LIVE_UPDATES_MAX_WAIT_MS = 10_000;

export const RELATIVE_RANGE_MS: Record<RelativeRange, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};
