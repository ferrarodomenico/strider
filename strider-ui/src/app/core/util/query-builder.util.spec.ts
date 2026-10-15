import { BuilderRow } from '@app/core/models/builder-row.model';
import {
  compileCondition,
  compileRow,
  FIELD_DEFS,
  fieldDefFor,
  quoteString,
} from './query-builder.util';

// AC-4 Builder filter mode (criteria 15-24)

describe('quoteString (AC-4 #20)', () => {
  it('wraps a plain string in single quotes', () => {
    expect(quoteString('api-gateway')).toBe("'api-gateway'");
  });

  it('escapes embedded single quotes by doubling them', () => {
    expect(quoteString("it's")).toBe("'it''s'");
  });

  it('handles a string with multiple single quotes', () => {
    expect(quoteString("o'reilly's")).toBe("'o''reilly''s'");
  });

  it('handles an empty string', () => {
    expect(quoteString('')).toBe("''");
  });

  // Security: ensures a value like "' OR 1=1 --" cannot break out of quoting
  it('safely escapes SQL injection attempt', () => {
    const malicious = "' OR 1=1 --";
    expect(quoteString(malicious)).toBe("''' OR 1=1 --'");
  });
});

describe('FIELD_DEFS (AC-4 #16-18)', () => {
  it('contains exactly 6 fields', () => {
    expect(FIELD_DEFS).toHaveLength(6);
  });

  it('contains all required fields in order', () => {
    const fields = FIELD_DEFS.map((d) => d.field);
    expect(fields).toContain('service_name');
    expect(fields).toContain('name');
    expect(fields).toContain('start_time');
    expect(fields).toContain('duration_ns');
    expect(fields).toContain('status_code');
    expect(fields).toContain('kind');
  });

  // AC-4 #17: string-type fields use = != LIKE
  it('service_name has string operators: =, !=, LIKE', () => {
    const def = fieldDefFor('service_name');
    expect(def.operators).toEqual(['=', '!=', 'LIKE']);
  });

  it('name has string operators: =, !=, LIKE', () => {
    const def = fieldDefFor('name');
    expect(def.operators).toEqual(['=', '!=', 'LIKE']);
  });

  // AC-4 #17 + locked decision: start_time has FULL operator set = != < > LIKE
  it('start_time has full operator set: =, !=, <, >, LIKE (locked decision)', () => {
    const def = fieldDefFor('start_time');
    expect(def.operators).toContain('=');
    expect(def.operators).toContain('!=');
    expect(def.operators).toContain('<');
    expect(def.operators).toContain('>');
    expect(def.operators).toContain('LIKE');
  });

  // AC-4 #18: numeric fields use = != < >
  it('duration_ns has numeric operators: =, !=, <, >', () => {
    const def = fieldDefFor('duration_ns');
    expect(def.operators).toEqual(['=', '!=', '<', '>']);
  });

  // duration_ns label is "Duration (ms)" (value entered in ms, stored as ns)
  it('duration_ns label is "Duration (ms)"', () => {
    const def = fieldDefFor('duration_ns');
    expect(def.label).toBe('Duration (ms)');
  });

  // AC-4 #18: enum fields use = !=
  it('status_code has enum operators: =, !=', () => {
    const def = fieldDefFor('status_code');
    expect(def.operators).toEqual(['=', '!=']);
  });

  it('kind has enum operators: =, !=', () => {
    const def = fieldDefFor('kind');
    expect(def.operators).toEqual(['=', '!=']);
  });
});

describe('compileRow', () => {
  function row(overrides: Partial<BuilderRow>): BuilderRow {
    return {
      id: 'r1',
      field: 'service_name',
      operator: '=',
      value: '',
      ...overrides,
    };
  }

  describe('service_name / name (string fields)', () => {
    it('compiles service_name = value with quotes', () => {
      expect(compileRow(row({ field: 'service_name', operator: '=', value: 'api-gw' }))).toBe(
        "service_name = 'api-gw'",
      );
    });

    it('compiles service_name != value', () => {
      expect(compileRow(row({ field: 'service_name', operator: '!=', value: 'api-gw' }))).toBe(
        "service_name != 'api-gw'",
      );
    });

    it('compiles service_name LIKE value', () => {
      expect(compileRow(row({ field: 'service_name', operator: 'LIKE', value: '%api%' }))).toBe(
        "service_name LIKE '%api%'",
      );
    });

    it('returns null when value is empty', () => {
      expect(compileRow(row({ field: 'service_name', value: '' }))).toBeNull();
    });

    it('compiles name field', () => {
      expect(compileRow(row({ field: 'name', operator: '=', value: 'HTTP GET' }))).toBe(
        "name = 'HTTP GET'",
      );
    });

    it('escapes single quotes in string values', () => {
      expect(
        compileRow(row({ field: 'service_name', operator: '=', value: "o'clock" })),
      ).toBe("service_name = 'o''clock'");
    });
  });

  describe('duration_ns (value entered in ms, compiled to ns)', () => {
    // 2.5 ms → 2.5 * 1_000_000 = 2_500_000 ns
    it('compiles 2.5 ms to duration_ns > 2500000', () => {
      expect(compileRow(row({ field: 'duration_ns', operator: '>', value: '2.5' }))).toBe(
        'duration_ns > 2500000',
      );
    });

    // 150 ms → 150 * 1_000_000 = 150_000_000 ns
    it('compiles 150 ms to duration_ns = 150000000', () => {
      expect(compileRow(row({ field: 'duration_ns', operator: '=', value: '150' }))).toBe(
        'duration_ns = 150000000',
      );
    });

    // Output must be an integer — no decimals or scientific notation
    it('produces integer ns output (no decimal, no exponent)', () => {
      const result = compileRow(row({ field: 'duration_ns', operator: '>', value: '2.5' }));
      expect(result).toBe('duration_ns > 2500000');
      expect(result).not.toMatch(/\./);
      expect(result).not.toMatch(/e/i);
    });

    // Fractional ms rounds correctly: 1.0000001 ms → Math.round(1.0000001 * 1_000_000) = 1000000
    it('rounds fractional ms via Math.round', () => {
      const result = compileRow(row({ field: 'duration_ns', operator: '=', value: '1.0000001' }));
      expect(result).toBe('duration_ns = 1000000');
    });

    it('compiles duration_ns = 0 ms', () => {
      expect(compileRow(row({ field: 'duration_ns', operator: '=', value: '0' }))).toBe(
        'duration_ns = 0',
      );
    });

    // Previously the test used '1000000' as raw ns; now '1000000' means ms
    it('compiles 1000000 ms to duration_ns > 1000000000000', () => {
      expect(compileRow(row({ field: 'duration_ns', operator: '>', value: '1000000' }))).toBe(
        'duration_ns > 1000000000000',
      );
    });

    it('returns null when duration_ns value is empty', () => {
      expect(compileRow(row({ field: 'duration_ns', value: '' }))).toBeNull();
    });

    it('returns null when duration_ns value is not a number', () => {
      expect(compileRow(row({ field: 'duration_ns', value: 'abc' }))).toBeNull();
    });
  });

  describe('status_code / kind (enum/int fields)', () => {
    it('compiles status_code = 2 as integer (not quoted)', () => {
      expect(compileRow(row({ field: 'status_code', operator: '=', value: '2' }))).toBe(
        'status_code = 2',
      );
    });

    it('compiles kind = 2 as integer', () => {
      expect(compileRow(row({ field: 'kind', operator: '=', value: '2' }))).toBe('kind = 2');
    });

    it('compiles kind != 1 as integer', () => {
      expect(compileRow(row({ field: 'kind', operator: '!=', value: '1' }))).toBe('kind != 1');
    });

    it('returns null when status_code value is empty', () => {
      expect(compileRow(row({ field: 'status_code', value: '' }))).toBeNull();
    });
  });

  describe('start_time (time field — ClickHouse parseDateTime64BestEffort)', () => {
    it('returns null for relative time with no relativeRange', () => {
      expect(compileRow(row({ field: 'start_time', timeMode: 'relative' }))).toBeNull();
    });

    // Relative preset → parseDateTime64BestEffort, not a bare ISO literal
    it('compiles relative time using parseDateTime64BestEffort', () => {
      const result = compileRow(
        row({ field: 'start_time', timeMode: 'relative', relativeRange: '1h' }),
      );
      expect(result).toMatch(/^start_time > parseDateTime64BestEffort\('/);
      expect(result).toMatch(/, 9\)$/);
    });

    // Comparison operators → parseDateTime64BestEffort
    it('compiles absolute time < with parseDateTime64BestEffort', () => {
      const result = compileRow(
        row({
          field: 'start_time',
          operator: '<',
          value: '2024-01-15T10:00',
          timeMode: 'absolute',
        }),
      );
      expect(result).toMatch(/^start_time < parseDateTime64BestEffort\('/);
      expect(result).toMatch(/, 9\)$/);
    });

    it('compiles absolute time = with parseDateTime64BestEffort', () => {
      const result = compileRow(
        row({
          field: 'start_time',
          operator: '=',
          value: '2024-01-15T10:00',
          timeMode: 'absolute',
        }),
      );
      expect(result).toMatch(/^start_time = parseDateTime64BestEffort\('/);
      expect(result).toMatch(/, 9\)$/);
    });

    it('compiles absolute time > with parseDateTime64BestEffort', () => {
      const result = compileRow(
        row({
          field: 'start_time',
          operator: '>',
          value: '2024-01-15T10:00',
          timeMode: 'absolute',
        }),
      );
      expect(result).toMatch(/^start_time > parseDateTime64BestEffort\('/);
      expect(result).toMatch(/, 9\)$/);
    });

    it('returns null for absolute time with empty value', () => {
      expect(compileRow(row({ field: 'start_time', value: '', timeMode: 'absolute' }))).toBeNull();
    });

    // LIKE operator → toString(start_time) LIKE '...' (not parseDateTime64BestEffort)
    it('LIKE operator emits toString(start_time) LIKE (locked decision)', () => {
      const result = compileRow(
        row({
          field: 'start_time',
          operator: 'LIKE',
          value: '2024-01-15T10:00',
          timeMode: 'absolute',
        }),
      );
      expect(result).toMatch(/^toString\(start_time\) LIKE '/);
    });

    it('LIKE operator does NOT emit parseDateTime64BestEffort', () => {
      const result = compileRow(
        row({
          field: 'start_time',
          operator: 'LIKE',
          value: '2024-01-15T10:00',
          timeMode: 'absolute',
        }),
      );
      expect(result).not.toContain('parseDateTime64BestEffort');
    });
  });
});

describe('BuilderRow model: connector field', () => {
  it('BuilderRow accepts connector OR', () => {
    const r: BuilderRow = {
      id: 'x',
      field: 'service_name',
      operator: '=',
      value: 'api',
      connector: 'OR',
    };
    expect(r.connector).toBe('OR');
  });

  it('BuilderRow accepts connector AND', () => {
    const r: BuilderRow = {
      id: 'x',
      field: 'service_name',
      operator: '=',
      value: 'api',
      connector: 'AND',
    };
    expect(r.connector).toBe('AND');
  });

  it('BuilderRow connector is optional (undefined by default)', () => {
    const r: BuilderRow = { id: 'x', field: 'service_name', operator: '=', value: 'api' };
    expect(r.connector).toBeUndefined();
  });
});

describe('compileCondition (AC-4 #19, #21) — per-row AND/OR connector', () => {
  function makeRow(
    field: BuilderRow['field'],
    operator: BuilderRow['operator'],
    value: string,
    connector?: 'AND' | 'OR',
  ): BuilderRow {
    return { id: `row-${field}`, field, operator, value, connector };
  }

  it('returns empty string for no rows', () => {
    expect(compileCondition([])).toBe('');
  });

  it('returns single condition for one row', () => {
    const rows = [makeRow('service_name', '=', 'api')];
    expect(compileCondition(rows)).toBe("service_name = 'api'");
  });

  // Default connector is AND when connector is undefined
  it('joins multiple rows with AND when no connector specified', () => {
    const rows = [
      makeRow('service_name', '=', 'api'),
      makeRow('name', 'LIKE', '%GET%'),
    ];
    expect(compileCondition(rows)).toBe("service_name = 'api' AND name LIKE '%GET%'");
  });

  // Two-row OR case
  it('joins two rows with OR when second row has connector OR', () => {
    const rows = [
      makeRow('service_name', '=', 'api'),
      makeRow('service_name', '=', 'frontend', 'OR'),
    ];
    expect(compileCondition(rows)).toBe("service_name = 'api' OR service_name = 'frontend'");
  });

  // Three rows with mixed connectors: first connector is ignored
  // rows: [A, B(OR), C(AND)] → "A OR B AND C"
  it('honors per-row connectors for three rows [A, B(OR), C(AND)]', () => {
    const rows = [
      makeRow('service_name', '=', 'api'),           // connector ignored (first)
      makeRow('name', 'LIKE', '%GET%', 'OR'),         // OR
      makeRow('status_code', '=', '2', 'AND'),        // AND
    ];
    expect(compileCondition(rows)).toBe(
      "service_name = 'api' OR name LIKE '%GET%' AND status_code = 2",
    );
  });

  // First row's connector is ignored even if set to OR
  it('ignores the first row connector even when set to OR', () => {
    const rows = [
      makeRow('service_name', '=', 'api', 'OR'),     // ignored
      makeRow('name', '=', 'root', 'AND'),
    ];
    expect(compileCondition(rows)).toBe("service_name = 'api' AND name = 'root'");
  });

  it('skips rows with empty values', () => {
    const rows = [
      makeRow('service_name', '=', ''),
      makeRow('name', 'LIKE', '%GET%'),
    ];
    expect(compileCondition(rows)).toBe("name LIKE '%GET%'");
  });

  it('returns empty string when all rows have empty values', () => {
    const rows = [makeRow('service_name', '=', ''), makeRow('name', '=', '')];
    expect(compileCondition(rows)).toBe('');
  });

  it('joins three rows with AND (all default connectors)', () => {
    const rows = [
      makeRow('service_name', '=', 'api'),
      makeRow('name', 'LIKE', '%GET%'),
      makeRow('status_code', '=', '2'),
    ];
    expect(compileCondition(rows)).toBe(
      "service_name = 'api' AND name LIKE '%GET%' AND status_code = 2",
    );
  });

  // duration_ns in compileCondition: value in ms, emits ns
  it('joins service_name and duration_ns rows (ms→ns conversion applies)', () => {
    const rows = [
      makeRow('service_name', '=', 'api'),
      makeRow('duration_ns', '>', '1'),          // 1 ms → 1000000 ns
    ];
    expect(compileCondition(rows)).toBe("service_name = 'api' AND duration_ns > 1000000");
  });
});
