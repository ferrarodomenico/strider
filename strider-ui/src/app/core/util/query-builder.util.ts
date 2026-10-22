import { BuilderRow, FieldDef } from '@app/core/models/builder-row.model';
import { BuilderField, ListMode, Operator } from '@app/core/models/view.types';
import { datetimeLocalToIso, isoToLocalDisplay, relativeRangeToIso } from './datetime.util';

// Operator groups reused per field type
const STRING_OPERATORS: Operator[] = ['=', '!=', 'LIKE'];
const NUMERIC_OPERATORS: Operator[] = ['=', '!=', '<', '>'];
const ENUM_OPERATORS: Operator[] = ['=', '!='];
// start_time: full operator set per user decision (overrides architect's =,<,>)
const TIME_OPERATORS: Operator[] = ['=', '!=', '<', '>', 'LIKE'];

const MS_TO_NS = 1_000_000;

// Full catalogue of builder fields; each list mode exposes a subset (see fieldDefsFor).
export const FIELD_DEFS: FieldDef[] = [
  { field: 'service_name', label: 'Service Name', valueInput: 'text', operators: STRING_OPERATORS },
  { field: 'root_name', label: 'Root Name', valueInput: 'text', operators: STRING_OPERATORS },
  { field: 'name', label: 'Name', valueInput: 'text', operators: STRING_OPERATORS },
  { field: 'start_time', label: 'Start Time', valueInput: 'time', operators: TIME_OPERATORS },
  { field: 'duration_ns', label: 'Duration (ms)', valueInput: 'number', operators: NUMERIC_OPERATORS },
  { field: 'span_count', label: 'Span Count', valueInput: 'number', operators: NUMERIC_OPERATORS },
  { field: 'status_code', label: 'Status', valueInput: 'select-status', operators: ENUM_OPERATORS },
  { field: 'kind', label: 'Kind', valueInput: 'select-kind', operators: ENUM_OPERATORS },
];

// Columns of the trace_summary table (traces mode)
export const TRACE_FIELDS: readonly BuilderField[] = [
  'service_name',
  'root_name',
  'start_time',
  'duration_ns',
  'span_count',
];

// Columns of the spans table (spans mode)
export const SPAN_FIELDS: readonly BuilderField[] = [
  'service_name',
  'name',
  'start_time',
  'duration_ns',
  'status_code',
  'kind',
];

// Safely single-quotes a string value for SQL; embedded single-quotes are doubled.
// Note: this output is sent to a local self-hosted backend with no auth; the builder
// always quotes via this function and never interpolates raw user input into SQL directly.
export const quoteString = (v: string): string => `'${v.replace(/'/g, "''")}'`;

const compileStartTime = (row: BuilderRow): string | null => {
  if (row.timeMode === 'relative') {
    if (!row.relativeRange) return null;
    return `start_time > ${quoteString(isoToLocalDisplay(relativeRangeToIso(row.relativeRange)))}`;
  }
  if (row.value === '') return null;
  const iso = datetimeLocalToIso(row.value);
  if (row.operator === 'LIKE') {
    return `toString(start_time) LIKE ${quoteString(iso)}`;
  }
  return `start_time ${row.operator} ${quoteString(isoToLocalDisplay(iso))}`;
};

export function compileRow(row: BuilderRow): string | null {
  switch (row.field) {
    case 'service_name':
    case 'root_name':
    case 'name':
      return row.value === '' ? null : `${row.field} ${row.operator} ${quoteString(row.value)}`;

    case 'duration_ns': {
      if (row.value === '' || Number.isNaN(Number(row.value))) return null;
      const ns = Math.round(Number(row.value) * MS_TO_NS);
      return `duration_ns ${row.operator} ${ns}`;
    }

    case 'span_count':
      if (row.value === '' || Number.isNaN(Number(row.value))) return null;
      return `span_count ${row.operator} ${parseInt(row.value, 10)}`;

    case 'status_code':
    case 'kind':
      return row.value === '' ? null : `${row.field} ${row.operator} ${parseInt(row.value, 10)}`;

    case 'start_time':
      return compileStartTime(row);
  }
}

export function compileCondition(rows: readonly BuilderRow[]): string {
  const compiled = rows
    .map((row) => ({ fragment: compileRow(row), connector: row.connector ?? 'AND' }))
    .filter((p): p is { fragment: string; connector: 'AND' | 'OR' } => p.fragment !== null);

  return compiled.reduce((acc, { fragment, connector }, index) => {
    if (index === 0) return fragment;
    return `${acc} ${connector} ${fragment}`;
  }, '');
}

export function fieldDefFor(field: BuilderField): FieldDef {
  return FIELD_DEFS.find((d) => d.field === field)!;
}

export function fieldDefsFor(mode: ListMode): FieldDef[] {
  return (mode === 'traces' ? TRACE_FIELDS : SPAN_FIELDS).map(fieldDefFor);
}
