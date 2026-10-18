import { IntervalRangeForm } from '@app/core/models/interval-range.model';
import { IntervalUnit } from '@app/core/models/view.types';

export const MIN_INTERVAL_VALUE = 1;
export const HOURS_PER_DAY = 24;

export const DEFAULT_INTERVAL_RANGE_FORM: IntervalRangeForm = {
  intervalValue: '1',
  intervalUnit: 'hour',
  start: '',
  end: '',
};

export const INTERVAL_UNIT_OPTIONS: readonly { value: IntervalUnit; label: string }[] = [
  { value: 'minute', label: 'Minute' },
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
];

export const INTERVAL_VALUE_ERROR = 'Interval must be a whole number of at least 1.';
export const RANGE_ORDER_ERROR = 'Start must be before end.';
