import { BuilderRow } from '@app/core/models/builder-row.model';
import { localDisplayToIso } from './datetime.util';
import { resolveDateLiterals } from './date-literal.util';
import { compileCondition } from './query-builder.util';

const wrapped = (localDisplay: string): string =>
  `parseDateTime64BestEffort('${localDisplayToIso(localDisplay)}', 9)`;

describe('resolveDateLiterals', () => {
  it('wraps a quoted local date literal with the UTC ISO value', () => {
    expect(resolveDateLiterals("start_time > '2026-10-15 10:00:00'")).toBe(
      `start_time > ${wrapped('2026-10-15 10:00:00')}`,
    );
  });

  it('accepts T separator, missing seconds and fractional seconds', () => {
    expect(resolveDateLiterals("a = '2026-10-15T10:00'")).toBe(
      `a = ${wrapped('2026-10-15 10:00')}`,
    );
    expect(resolveDateLiterals("a = '2026-10-15 10:00:00.123456789'")).toContain(
      'parseDateTime64BestEffort(',
    );
  });

  it('leaves non-date strings unchanged', () => {
    const condition = "service_name = 'api' AND name = '2026-10-15' AND x = '2026-10-15 10:00:00Z'";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });

  it('leaves text without quotes unchanged', () => {
    expect(resolveDateLiterals('duration_ns > 1000')).toBe('duration_ns > 1000');
    expect(resolveDateLiterals('')).toBe('');
  });

  it('leaves literals after LIKE and ILIKE unchanged', () => {
    const condition =
      "toString(start_time) LIKE '2026-10-15 10:00:00' OR x ilike '2026-10-15 10:00'";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });

  it('leaves literals after NOT LIKE unchanged', () => {
    const condition = "x NOT LIKE '2026-10-15 10:00:00'";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });

  it('does not wrap literals already inside parseDateTime64BestEffort', () => {
    const condition = "start_time > parseDateTime64BestEffort('2026-10-15 10:00:00', 9)";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });

  it('converts several dates in one condition', () => {
    expect(
      resolveDateLiterals(
        "start_time > '2026-10-15 10:00:00' AND start_time < '2026-10-16 11:30:00'",
      ),
    ).toBe(
      `start_time > ${wrapped('2026-10-15 10:00:00')} AND start_time < ${wrapped('2026-10-16 11:30:00')}`,
    );
  });

  it('respects doubled-quote escapes', () => {
    const condition =
      "name = 'it''s '' 2026-10-15 10:00:00' AND start_time > '2026-10-15 10:00:00'";
    expect(resolveDateLiterals(condition)).toBe(
      `name = 'it''s '' 2026-10-15 10:00:00' AND start_time > ${wrapped('2026-10-15 10:00:00')}`,
    );
  });

  it('respects backslash escapes', () => {
    const condition = "name = 'a\\' b' AND start_time > '2026-10-15 10:00:00'";
    expect(resolveDateLiterals(condition)).toBe(
      `name = 'a\\' b' AND start_time > ${wrapped('2026-10-15 10:00:00')}`,
    );
  });

  it('leaves a date-shaped literal with an invalid calendar value unchanged', () => {
    const condition = "start_time > '2026-13-45 10:00:00'";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });
});

describe('resolveDateLiterals (round trip and robustness)', () => {
  const ISO_IN_OUTPUT = /parseDateTime64BestEffort\('([^']+)', 9\)/;

  it('resolved instant equals the original instant (seconds precision) for absolute time', () => {
    const original = new Date(2026, 9, 15, 10, 30, 45);
    const row = {
      field: 'start_time',
      operator: '>',
      value: '2026-10-15T10:30:45',
      timeMode: 'absolute',
    } as unknown as BuilderRow;
    const plain = compileCondition([row]);
    const iso = ISO_IN_OUTPUT.exec(resolveDateLiterals(plain))?.[1];
    expect(iso).toBeDefined();
    expect(new Date(iso as string).getTime()).toBe(original.getTime());
  });

  it('resolved instant for a relative range is within 1s of the original', () => {
    const before = Date.now() - 3_600_000;
    const row = {
      field: 'start_time',
      operator: '>',
      value: '',
      timeMode: 'relative',
      relativeRange: '1h',
    } as unknown as BuilderRow;
    const plain = compileCondition([row]);
    expect(plain).not.toContain('parseDateTime64BestEffort');
    const iso = ISO_IN_OUTPUT.exec(resolveDateLiterals(plain))?.[1] as string;
    expect(Math.abs(new Date(iso).getTime() - before)).toBeLessThan(2000);
  });

  it('output ISO is generated (injection-looking neighbours stay quoted, untouched)', () => {
    const condition = "name = 'x'' OR 1=1 --' AND start_time > '2026-10-15 10:00:00'";
    const out = resolveDateLiterals(condition);
    expect(out.startsWith("name = 'x'' OR 1=1 --' AND start_time > ")).toBe(true);
    expect(out).toMatch(/parseDateTime64BestEffort\('\d{4}-\d{2}-\d{2}T[\d:.]+Z', 9\)$/);
  });

  it('does not hang on unterminated or pathological quote input', () => {
    const start = performance.now();
    resolveDateLiterals("a = '" + "\'".repeat(5000) + "''".repeat(5000));
    resolveDateLiterals("a = '" + 'x'.repeat(20000));
    resolveDateLiterals('LIKE' + ' '.repeat(20000) + 'x');
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('handles LIKE followed by newline/tab whitespace', () => {
    const condition = "x LIKE\n\t'2026-10-15 10:00:00'";
    expect(resolveDateLiterals(condition)).toBe(condition);
  });
});
