import { buildListUrl, buildTraceDetailUrl } from './api-url.util';

// AC-2: Sort params sent correctly; AC-3: condition omitted when empty

describe('buildListUrl', () => {
  it('includes orderBy and direction params', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: null,
    });
    expect(url).toContain('orderBy=start_time');
    expect(url).toContain('direction=DESC');
  });

  it('omits condition param when condition is empty (AC-3 #14)', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: null,
    });
    expect(url).not.toContain('condition');
  });

  it('omits condition param when condition is whitespace only', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '   ',
      limit: null,
    });
    expect(url).not.toContain('condition');
  });

  it('includes condition param when condition is non-empty (AC-3 #12)', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: "service_name = 'api'",
      limit: null,
    });
    expect(url).toContain('condition=');
  });

  it('URL-encodes the condition string (edge case: spaces, quotes, operators)', () => {
    const condition = "service_name = 'api gateway'";
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition,
      limit: null,
    });
    // URLSearchParams encodes the value; decode via URLSearchParams API (handles + for spaces)
    expect(url).toContain('condition=');
    const queryString = url.split('?')[1];
    const decoded = new URLSearchParams(queryString).get('condition');
    expect(decoded).toBe(condition);
  });

  it('builds URL for /spans path', () => {
    const url = buildListUrl('', '/spans', {
      orderBy: 'start_time',
      direction: 'ASC',
      condition: '',
      limit: null,
    });
    expect(url).toContain('/spans?');
    expect(url).toContain('direction=ASC');
  });

  it('never targets :4317 (AC-2: no gRPC port in URL)', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: null,
    });
    expect(url).not.toContain('4317');
  });

  it('uses base URL prefix when provided', () => {
    const url = buildListUrl('http://localhost:8080', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: null,
    });
    expect(url).toMatch(/^http:\/\/localhost:8080\/traces\?/);
  });

  it('includes limit param when a limit is selected', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: 1000,
    });
    expect(new URLSearchParams(url.split('?')[1]).get('limit')).toBe('1000');
  });

  it('omits limit param when limit is None', () => {
    const url = buildListUrl('', '/traces', {
      orderBy: 'start_time',
      direction: 'DESC',
      condition: '',
      limit: null,
    });
    expect(url).not.toContain('limit');
  });
});

describe('buildTraceDetailUrl', () => {
  it('builds correct URL for a trace ID', () => {
    const url = buildTraceDetailUrl('', 'abc123');
    expect(url).toBe('/traces/abc123');
  });

  it('URL-encodes special characters in trace ID', () => {
    const url = buildTraceDetailUrl('', 'abc/def');
    expect(url).toContain('abc%2Fdef');
  });

  it('never targets :4317 (AC-2)', () => {
    const url = buildTraceDetailUrl('', 'abc123');
    expect(url).not.toContain('4317');
  });
});
