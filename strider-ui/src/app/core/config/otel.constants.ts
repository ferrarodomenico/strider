export const SPAN_KIND_LABELS: Record<number, string> = {
  0: 'UNSPECIFIED',
  1: 'INTERNAL',
  2: 'SERVER',
  3: 'CLIENT',
  4: 'PRODUCER',
  5: 'CONSUMER',
};

export const STATUS_CODE_LABELS: Record<number, string> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

export const spanKindLabel = (k: number): string => SPAN_KIND_LABELS[k] ?? `KIND_${k}`;
export const statusCodeLabel = (c: number): string => STATUS_CODE_LABELS[c] ?? `STATUS_${c}`;

export const KIND_FILTER_OPTIONS = [
  { label: 'SERVER', value: 2 },
  { label: 'CLIENT', value: 3 },
  { label: 'PRODUCER', value: 4 },
  { label: 'CONSUMER', value: 5 },
  { label: 'INTERNAL', value: 1 },
] as const;

export const STATUS_FILTER_OPTIONS = [
  { label: 'UNSET', value: 0 },
  { label: 'OK', value: 1 },
  { label: 'ERROR', value: 2 },
] as const;
