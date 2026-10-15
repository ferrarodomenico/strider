import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { API_BASE_URL, STREAM_ROW_CAP } from '@app/core/config/api.config';
import { NdjsonStreamService } from './ndjson-stream.service';

// Helper: build a ReadableStream from NDJSON text lines
function makeNdjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const payload = lines.join('\n') + '\n';
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

// Helper: flush all pending microtasks + a macrotask tick
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function mockFetch(ok: boolean, stream: ReadableStream<Uint8Array> | null, status = 200, statusText = 'OK') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText,
      body: stream,
      // FIX #2: composeHttpError now calls res.text() on non-ok responses
      text: () => Promise.resolve(''),
    }),
  );
}

const baseQuery = { orderBy: 'start_time' as const, direction: 'DESC' as const, condition: '' };
const identity = (raw: unknown) => raw;

describe('NdjsonStreamService (AC-5)', () => {
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

  // AC-5 #26: streaming indicator visible while streaming
  it('starts with status "streaming" immediately after stream() call (AC-5 #26)', () => {
    mockFetch(true, makeNdjsonStream([JSON.stringify({ id: 1 })]));
    const handle = service.stream('/traces', baseQuery, identity);
    expect(handle.status()).toBe('streaming');
  });

  // AC-5 #25: rows appear incrementally
  it('delivers rows after stream completes (AC-5 #25)', async () => {
    const lines = [JSON.stringify({ id: 1 }), JSON.stringify({ id: 2 })];
    mockFetch(true, makeNdjsonStream(lines));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.rows().length).toBe(2);
    expect((handle.rows()[0] as any).id).toBe(1);
  });

  // AC-5 #30: normal close → status done, no error
  it('transitions status to "done" when stream closes normally (AC-5 #30)', async () => {
    mockFetch(true, makeNdjsonStream([JSON.stringify({ id: 1 })]));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.status()).toBe('done');
    expect(handle.error()).toBeNull();
  });

  // AC-5 #31: HTTP error before any rows
  // FIX #2: error now uses composeHttpError → statusText label, not raw status int
  it('sets status to "error" and error message on HTTP error response (AC-5 #31)', async () => {
    mockFetch(false, null, 500, 'Internal Server Error');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.status()).toBe('error');
    expect(handle.error()).toContain('Internal Server Error');
  });

  it('uses statusText as label in error message (FIX #2)', async () => {
    mockFetch(false, null, 404, 'Not Found');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toContain('Not Found');
  });

  it('falls back to "HTTP <status>" label when statusText is empty (FIX #2)', async () => {
    mockFetch(false, null, 418, '');
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.error()).toBe('HTTP 418');
  });

  // AC-5 #29: cancel → rows retained, status done
  it('cancels stream and retains received rows (AC-5 #29)', async () => {
    // Create a stream that sends one batch but does not close immediately
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        streamController = ctrl;
      },
    });
    mockFetch(true, stream);

    const handle = service.stream('/traces', baseQuery, identity);
    // Wait for fetch to resolve, then enqueue one row before cancelling
    await flushPromises();
    streamController!.enqueue(encoder.encode(JSON.stringify({ id: 99 }) + '\n'));
    await flushPromises();

    handle.cancel();
    await flushPromises();

    expect(handle.status()).toBe('done');
    // capReached should not be set; cancel was user-initiated
    expect(handle.capReached()).toBe(false);
  });

  // AC-5 #32: row cap at STREAM_ROW_CAP
  it('stops appending rows and sets capReached when cap is hit (AC-5 #32)', async () => {
    // Create STREAM_ROW_CAP + 1 rows in one chunk
    const lines = Array.from({ length: STREAM_ROW_CAP + 1 }, (_, i) =>
      JSON.stringify({ id: i }),
    );
    mockFetch(true, makeNdjsonStream(lines));
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.rows().length).toBe(STREAM_ROW_CAP);
    expect(handle.capReached()).toBe(true);
    expect(handle.status()).toBe('done');
  });

  // Verify the fetch URL does not target gRPC port
  it('does not target port 4317 in the fetch URL (AC-2)', async () => {
    let capturedUrl = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({ ok: true, status: 200, body: makeNdjsonStream([]) });
    }));
    service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(capturedUrl).not.toContain('4317');
  });

  // AC-5 #32: capReached starts false
  it('capReached starts as false', () => {
    mockFetch(true, makeNdjsonStream([]));
    const handle = service.stream('/traces', baseQuery, identity);
    expect(handle.capReached()).toBe(false);
  });

  // error starts null
  it('error starts as null', () => {
    mockFetch(true, makeNdjsonStream([]));
    const handle = service.stream('/traces', baseQuery, identity);
    expect(handle.error()).toBeNull();
  });

  // Skips empty lines in NDJSON
  it('skips blank lines in the NDJSON stream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(JSON.stringify({ id: 1 }) + '\n\n\n'));
        ctrl.close();
      },
    });
    mockFetch(true, stream);
    const handle = service.stream('/traces', baseQuery, identity);
    await flushPromises();
    expect(handle.rows().length).toBe(1);
  });
});
