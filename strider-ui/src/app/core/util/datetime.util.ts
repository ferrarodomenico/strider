import { RELATIVE_RANGE_MS } from '@app/core/config/api.config';
import { RelativeRange } from '@app/core/models/view.types';

export const rfc3339ToEpochMs = (s: string): number => Date.parse(s);

export const relativeRangeToIso = (r: RelativeRange, now = Date.now()): string =>
  new Date(now - RELATIVE_RANGE_MS[r]).toISOString();

export const datetimeLocalToIso = (local: string): string => new Date(local).toISOString();
