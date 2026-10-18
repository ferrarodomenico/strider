import {
  HOURS_PER_DAY,
  INTERVAL_VALUE_ERROR,
  MIN_INTERVAL_VALUE,
  RANGE_ORDER_ERROR,
} from '@app/core/config/stats.constants';
import {
  IntervalRangeForm,
  IntervalRangeFormErrors,
  IntervalRangeQuery,
} from '@app/core/models/interval-range.model';
import { IntervalUnit } from '@app/core/models/view.types';
import { datetimeLocalToIso } from './datetime.util';

const GO_DURATION_BY_UNIT: Record<IntervalUnit, { factor: number; suffix: string }> = {
  minute: { factor: 1, suffix: 'm' },
  hour: { factor: 1, suffix: 'h' },
  day: { factor: HOURS_PER_DAY, suffix: 'h' },
};

export function parseIntervalValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= MIN_INTERVAL_VALUE ? value : null;
}

export function toGoDuration(value: number, unit: IntervalUnit): string {
  const { factor, suffix } = GO_DURATION_BY_UNIT[unit];
  return `${value * factor}${suffix}`;
}

export function validateIntervalRangeForm(form: IntervalRangeForm): IntervalRangeFormErrors {
  return {
    interval: parseIntervalValue(form.intervalValue) === null ? INTERVAL_VALUE_ERROR : null,
    range: isRangeOrdered(form.start, form.end) ? null : RANGE_ORDER_ERROR,
  };
}

export function buildIntervalRangeQuery(form: IntervalRangeForm): IntervalRangeQuery | null {
  const value = parseIntervalValue(form.intervalValue);
  if (value === null || !isRangeOrdered(form.start, form.end)) return null;
  return {
    interval: toGoDuration(value, form.intervalUnit),
    start: localToIsoOrNull(form.start),
    end: localToIsoOrNull(form.end),
  };
}

function isRangeOrdered(start: string, end: string): boolean {
  if (start === '' || end === '') return true;
  return Date.parse(start) < Date.parse(end);
}

function localToIsoOrNull(local: string): string | null {
  return local === '' ? null : datetimeLocalToIso(local);
}
