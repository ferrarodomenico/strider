import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { API_BASE_URL } from '@app/core/config/api.config';
import { NdjsonStreamService } from './ndjson-stream.service';

function mockFetch(ok: boolean, body: string, status = 200, statusText = 'OK') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    text: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const query = {
  orderBy: 'start_time' as const,
  direction: 'DESC' as const,
  condition: 'ts >= 5',
  limit: 3,
};
const identity = (raw: unknown) => raw;

describe('NdjsonStreamService.fetchAll', () => {
  let service: NdjsonStreamService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        NdjsonStreamService,
        { provide: API_BASE_URL, useValue: '' },
      ],
    });
    service = TestBed.inject(NdjsonStreamService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves with every mapped line, skipping blank ones', async () => {
    mockFetch(true, '{"n":1}\n\n{"n":2}\n');
    const rows = await service.fetchAll(
      '/traces',
      query,
      (raw) => (raw as { n: number }).n,
      new AbortController().signal,
    );
    expect(rows).toEqual([1, 2]);
  });

  it('parses a last line without a trailing newline', async () => {
    mockFetch(true, '{"n":1}\n{"n":2}');
    const rows = await service.fetchAll('/traces', query, identity, new AbortController().signal);
    expect(rows).toHaveLength(2);
  });

  it('resolves with no rows for an empty body', async () => {
    mockFetch(true, '');
    await expect(
      service.fetchAll('/traces', query, identity, new AbortController().signal),
    ).resolves.toEqual([]);
  });

  it('sends the condition and limit as query params', async () => {
    const fetchMock = mockFetch(true, '');
    await service.fetchAll('/spans', query, identity, new AbortController().signal);
    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/spans');
    expect(url.searchParams.get('condition')).toBe('ts >= 5');
    expect(url.searchParams.get('limit')).toBe('3');
  });

  it('rejects with the status and body detail on a non-2xx response', async () => {
    mockFetch(false, 'bad condition', 500, 'Internal Server Error');
    await expect(
      service.fetchAll('/traces', query, identity, new AbortController().signal),
    ).rejects.toThrow('Internal Server Error: bad condition');
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = mockFetch(true, '');
    const ctrl = new AbortController();
    await service.fetchAll('/traces', query, identity, ctrl.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(ctrl.signal);
  });
});
