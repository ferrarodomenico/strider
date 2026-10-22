/**
 * Tests for FIX #2 – Error message display in NdjsonStreamService.
 *
 * `extractBodyDetail` and `composeHttpError` are module-private, so we test
 * them through the service by mocking `fetch` to return non-ok responses with
 * various body shapes.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { API_BASE_URL } from '@app/core/config/api.config';
import { NdjsonStreamService } from './ndjson-stream.service';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const baseQuery = { orderBy: 'start_time' as const, direction: 'DESC' as const, condition: '', limit: null };
const identity = (raw: unknown) => raw;

/** Stub global fetch to return a non-ok response with a given text body. */
function mockErrorFetch(status: number, statusText: string, bodyText: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      text: () => Promise.resolve(bodyText),
    }),
  );
}

describe('NdjsonStreamService – composeHttpError / extractBodyDetail (FIX #2)', () => {
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

  // --- JSON body with "error" field ---
  it('uses JSON .error field as detail when present', async () => {
    mockErrorFetch(500, 'Internal Server Error', JSON.stringify({ error: 'db connection failed' }));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Internal Server Error: db connection failed');
  });

  // --- JSON body with "message" field ---
  it('falls back to JSON .message field when .error is absent', async () => {
    mockErrorFetch(503, 'Service Unavailable', JSON.stringify({ message: 'try again later' }));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Service Unavailable: try again later');
  });

  // --- JSON body with both fields: .error wins ---
  it('prefers JSON .error over .message when both are present', async () => {
    mockErrorFetch(
      400,
      'Bad Request',
      JSON.stringify({ error: 'invalid field', message: 'ignored' }),
    );
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Bad Request: invalid field');
  });

  // --- Plain-text body ---
  it('uses raw trimmed text as detail when body is not JSON', async () => {
    mockErrorFetch(500, 'Internal Server Error', '  something went wrong  ');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Internal Server Error: something went wrong');
  });

  // --- Empty body → show only statusText ---
  it('shows only statusText when body is empty', async () => {
    mockErrorFetch(503, 'Service Unavailable', '');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Service Unavailable');
  });

  // --- Whitespace-only body → treat as empty ---
  it('shows only statusText when body is whitespace only', async () => {
    mockErrorFetch(502, 'Bad Gateway', '   ');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Bad Gateway');
  });

  // --- detail equals statusText → no duplication ---
  it('avoids duplication when detail equals statusText', async () => {
    mockErrorFetch(503, 'Service Unavailable', 'Service Unavailable');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('Service Unavailable');
    // Must NOT produce "Service Unavailable: Service Unavailable"
    expect(handle.error()).not.toContain('Service Unavailable: Service Unavailable');
  });

  // --- Missing / empty statusText → fall back to "HTTP <status>" ---
  it('falls back to "HTTP <status>" label when statusText is absent', async () => {
    mockErrorFetch(418, '', JSON.stringify({ error: 'teapot' }));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('HTTP 418: teapot');
  });

  it('shows "HTTP <status>" alone when statusText is absent and body is empty', async () => {
    mockErrorFetch(418, '', '');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('HTTP 418');
  });

  // --- JSON body with non-string error field → raw text fallback ---
  it('falls back to raw JSON text when .error is not a string', async () => {
    const rawBody = JSON.stringify({ error: 42 });
    mockErrorFetch(500, 'Internal Server Error', rawBody);
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    // raw text used as detail since .error is a number
    expect(handle.error()).toBe(`Internal Server Error: ${rawBody}`);
  });

  // --- Aborted fetch must NOT surface as error ---
  it('does NOT surface an error when the stream is cancelled (aborted)', async () => {
    // Create a stream that never resolves (simulates a slow server)
    let rejectFetch!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise<never>((_resolve, reject) => {
          rejectFetch = () => reject(new DOMException('The user aborted a request.', 'AbortError'));
        }),
      ),
    );

    const handle = service.stream('/traces', baseQuery, identity);
    // Cancel before fetch resolves
    handle.cancel();
    // Abort the mock promise
    rejectFetch();
    await flushPromises();

    expect(handle.error()).toBeNull();
    expect(handle.status()).toBe('done');
  });

  // --- status and error set correctly on HTTP error ---
  it('sets status to "error" on HTTP non-ok response', async () => {
    mockErrorFetch(500, 'Internal Server Error', 'boom');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.status()).toBe('error');
    expect(handle.error()).not.toBeNull();
  });
});
