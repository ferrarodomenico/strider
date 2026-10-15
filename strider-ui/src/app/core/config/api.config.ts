import { InjectionToken } from '@angular/core';
import { RelativeRange } from '@app/core/models/view.types';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

export const API_PATHS = {
  traces: '/traces',
  spans: '/spans',
  traceDetail: (id: string) => `/traces/${encodeURIComponent(id)}`,
} as const;

export const STREAM_ROW_CAP = 10_000;
export const ROW_HEIGHT_PX = 40;
export const MIN_BAR_WIDTH_PX = 2;
export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

export const RELATIVE_RANGE_MS: Record<RelativeRange, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};
