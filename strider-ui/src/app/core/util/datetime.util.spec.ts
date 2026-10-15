import { datetimeLocalToIso, relativeRangeToIso, rfc3339ToEpochMs } from './datetime.util';

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
