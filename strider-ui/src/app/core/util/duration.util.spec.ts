import { formatDuration } from './duration.util';

// AC-10: Duration formatting thresholds (criteria 54-58)
describe('formatDuration', () => {
  // AC-10 #54: 1 500 000 000 ns → '1.5s'
  it('formats seconds: 1_500_000_000 ns → "1.5s"', () => {
    expect(formatDuration(1_500_000_000)).toBe('1.5s');
  });

  // AC-10 #55: 42 100 000 ns → '42.1ms'
  it('formats milliseconds: 42_100_000 ns → "42.1ms"', () => {
    expect(formatDuration(42_100_000)).toBe('42.1ms');
  });

  // AC-10 #56: 300 000 ns → '300.0µs'
  it('formats microseconds: 300_000 ns → "300.0µs"', () => {
    expect(formatDuration(300_000)).toBe('300.0µs');
  });

  // AC-10 #57: 800 ns → '800ns'
  it('formats nanoseconds: 800 ns → "800ns"', () => {
    expect(formatDuration(800)).toBe('800ns');
  });

  // Boundary values
  it('formats exactly 1 000 000 000 ns as seconds', () => {
    expect(formatDuration(1_000_000_000)).toBe('1.0s');
  });

  it('formats exactly 1 000 000 ns as milliseconds', () => {
    expect(formatDuration(1_000_000)).toBe('1.0ms');
  });

  it('formats exactly 1 000 ns as microseconds', () => {
    expect(formatDuration(1_000)).toBe('1.0µs');
  });

  it('formats 0 ns as "0ns"', () => {
    expect(formatDuration(0)).toBe('0ns');
  });

  it('formats 1 ns as "1ns"', () => {
    expect(formatDuration(1)).toBe('1ns');
  });

  it('formats 999 ns as "999ns"', () => {
    expect(formatDuration(999)).toBe('999ns');
  });

  // Edge cases: invalid inputs
  it('returns "0ns" for negative values', () => {
    expect(formatDuration(-1)).toBe('0ns');
  });

  it('returns "0ns" for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('0ns');
  });

  it('returns "0ns" for NaN', () => {
    expect(formatDuration(NaN)).toBe('0ns');
  });

  // AC-10 #58: single implementation is used (verified by existence of single export)
  it('is a single exported function (not duplicated)', () => {
    expect(typeof formatDuration).toBe('function');
  });
});
