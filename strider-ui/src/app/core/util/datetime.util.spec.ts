import {
  datetimeLocalToIso,
  isoToLocalDisplay,
  localDisplayToIso,
  relativeRangeToIso,
  rfc3339ToEpochMs,
} from './datetime.util';

describe('rfc3339ToEpochMs', () => {
  it('parses a valid RFC3339 string to milliseconds', () => {
    const ms = rfc3339ToEpochMs('2024-01-15T10:00:00.000Z');
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThan(0);
  });

  it('two dates with 500ms difference differ by 500', () => {
    const t1 = rfc3339ToEpochMs('2024-01-01T00:00:00.000Z');
    const t2 = rfc3339ToEpochMs('2024-01-01T00:00:00.500Z');
    expect(t2 - t1).toBe(500);
  });

  it('returns NaN for invalid date strings', () => {
    expect(rfc3339ToEpochMs('not-a-date')).toBeNaN();
  });
});

describe('relativeRangeToIso', () => {
  const now = new Date('2024-01-15T12:00:00.000Z').getTime();

  it('returns ISO string 15m before the given timestamp', () => {
    const iso = relativeRangeToIso('15m', now);
    const expected = new Date(now - 15 * 60_000).toISOString();
    expect(iso).toBe(expected);
  });

  it('returns ISO string 1h before the given timestamp', () => {
    const iso = relativeRangeToIso('1h', now);
    const expected = new Date(now - 60 * 60_000).toISOString();
    expect(iso).toBe(expected);
  });

  it('returns ISO string 24h before the given timestamp', () => {
    const iso = relativeRangeToIso('24h', now);
    const expected = new Date(now - 24 * 60 * 60_000).toISOString();
    expect(iso).toBe(expected);
  });

  it('returns ISO string 7d before the given timestamp', () => {
    const iso = relativeRangeToIso('7d', now);
    const expected = new Date(now - 7 * 24 * 60 * 60_000).toISOString();
    expect(iso).toBe(expected);
  });

  it('returns a valid ISO string', () => {
    const iso = relativeRangeToIso('1h', now);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('datetimeLocalToIso', () => {
  it('converts a datetime-local string to ISO format', () => {
    // datetime-local format: YYYY-MM-DDTHH:mm
    const iso = datetimeLocalToIso('2024-01-15T10:00');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(iso).toContain('2024');
  });
});

describe('isoToLocalDisplay', () => {
  it('formats an instant as local YYYY-MM-DD HH:MM:SS', () => {
    const iso = new Date(2024, 0, 15, 9, 5, 7).toISOString();
    expect(isoToLocalDisplay(iso)).toBe('2024-01-15 09:05:07');
  });
});

describe('localDisplayToIso', () => {
  it('interprets the display string as local time and returns UTC ISO', () => {
    expect(localDisplayToIso('2024-01-15 09:05:07')).toBe(
      new Date(2024, 0, 15, 9, 5, 7).toISOString(),
    );
  });

  it('accepts a T separator and omitted seconds', () => {
    expect(localDisplayToIso('2024-01-15T10:00')).toBe(new Date(2024, 0, 15, 10, 0).toISOString());
  });

  it('round-trips with isoToLocalDisplay', () => {
    const display = '2026-10-15 10:00:00';
    expect(isoToLocalDisplay(localDisplayToIso(display))).toBe(display);
  });

  it('throws RangeError for an invalid date', () => {
    expect(() => localDisplayToIso('2024-13-45 10:00:00')).toThrow(RangeError);
  });
});
