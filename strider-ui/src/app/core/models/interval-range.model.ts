import { IntervalUnit } from './view.types';

/** Raw control values, kept as typed so they survive tab switches even when invalid. */
export interface IntervalRangeForm {
  intervalValue: string;
  intervalUnit: IntervalUnit;
  /** datetime-local value, or '' when unset. */
  start: string;
  /** datetime-local value, or '' when unset. */
  end: string;
}

export interface IntervalRangeFormErrors {
  interval: string | null;
  range: string | null;
}

/** A validated request: interval is a Go duration string; start/end are RFC3339, null = omit. */
export interface IntervalRangeQuery {
  interval: string;
  start: string | null;
  end: string | null;
}
