export function formatDuration(ns: number): string {
  if (!Number.isFinite(ns) || ns < 0) return '0ns';
  if (ns >= 1_000_000_000) return (ns / 1_000_000_000).toFixed(1) + 's';
  if (ns >= 1_000_000) return (ns / 1_000_000).toFixed(1) + 'ms';
  if (ns >= 1_000) return (ns / 1_000).toFixed(1) + 'µs';
  return `${Math.round(ns)}ns`;
}
