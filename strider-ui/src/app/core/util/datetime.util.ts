import { RELATIVE_RANGE_MS } from '@app/core/config/api.config';
import { RelativeRange } from '@app/core/models/view.types';

export const rfc3339ToEpochMs = (s: string): number => Date.parse(s);

export const relativeRangeToIso = (r: RelativeRange, now = Date.now()): string =>
  new Date(now - RELATIVE_RANGE_MS[r]).toISOString();

export const datetimeLocalToIso = (local: string): string => new Date(local).toISOString();

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Formats an ISO instant as local time: 'YYYY-MM-DD HH:MM:SS'.
export const isoToLocalDisplay = (iso: string): string => {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${date} ${time}`;
};

// Interprets 'YYYY-MM-DD HH:MM[:SS[.fff]]' (or with a 'T' separator) as local time
// and returns the UTC ISO string. Throws RangeError for an invalid date.
export const localDisplayToIso = (display: string): string =>
  new Date(display.replace(' ', 'T')).toISOString();
