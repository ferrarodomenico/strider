import { TestBed } from '@angular/core/testing';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { NdjsonStreamService, StreamHandle } from '@app/core/http/ndjson-stream.service';
import { API_BASE_URL } from '@app/core/config/api.config';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import { StreamStatus } from '@app/core/models/view.types';
import { localDisplayToIso } from '@app/core/util/datetime.util';
import { ExploreStore } from './explore.store';

function makeMockHandle(
  status: StreamStatus = 'done',
): StreamHandle<TraceSummary | SpanSummary> {
  return {
    rows: signal<readonly (TraceSummary | SpanSummary)[]>([]).asReadonly(),
    status: signal<StreamStatus>(status).asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    capReached: signal(false).asReadonly(),
    cancel: vi.fn(),
  };
}

describe('ExploreStore (AC-1, AC-2, AC-3, AC-4)', () => {
  let store: ExploreStore;
  let mockStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockStream = vi.fn().mockReturnValue(makeMockHandle());

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ExploreStore,
        { provide: NdjsonStreamService, useValue: { stream: mockStream } },
        { provide: API_BASE_URL, useValue: '' },
      ],
    });

    store = TestBed.inject(ExploreStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // AC-1 #1: default mode is 'traces'
  it('has default mode "traces" (AC-1 #1)', () => {
    expect(store.mode()).toBe('traces');
  });

  // AC-2: default sort is start_time DESC
  it('has default orderBy "start_time" and direction "DESC"', () => {
    expect(store.orderBy()).toBe('start_time');
    expect(store.direction()).toBe('DESC');
  });

  // AC-2 #6: sort fields include span_count for traces mode
  it('availableSortFields includes span_count in traces mode (AC-2 #6)', () => {
    expect(store.availableSortFields()).toContain('span_count');
    expect(store.availableSortFields()).toContain('start_time');
    expect(store.availableSortFields()).toContain('duration_ns');
  });

  // AC-1 #4: span_count absent in spans mode
  it('availableSortFields excludes span_count in spans mode (AC-1 #4)', () => {
    store.setMode('spans');
    expect(store.availableSortFields()).not.toContain('span_count');
    expect(store.availableSortFields()).toContain('start_time');
    expect(store.availableSortFields()).toContain('duration_ns');
  });

  it('ensureLoaded() triggers a stream request', () => {
    store.ensureLoaded();
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('ensureLoaded() does not re-request if already loaded', () => {
    store.ensureLoaded();
    store.ensureLoaded();
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  // AC-1 #5: switching mode while streaming cancels in-flight stream
  it('setMode() cancels previous stream handle (AC-1 #5)', () => {
    const handle1 = makeMockHandle('streaming');
    mockStream.mockReturnValueOnce(handle1);
    store.ensureLoaded();
    store.setMode('spans');
    expect(handle1.cancel).toHaveBeenCalled();
  });

  // AC-1 #2: switching to spans mode issues request to /spans
  it('setMode("spans") issues a request for /spans path', () => {
    store.ensureLoaded();
    store.setMode('spans');
    // Second call should be for /spans
    const lastCall = mockStream.mock.calls[1];
    expect(lastCall[0]).toBe('/spans');
  });

  // AC-1 #3: switching back to traces issues request for /traces
  it('setMode("traces") issues a request for /traces path', () => {
    store.ensureLoaded();
    store.setMode('spans');
    store.setMode('traces');
    const lastCall = mockStream.mock.calls[2];
    expect(lastCall[0]).toBe('/traces');
  });

  // When orderBy is span_count and mode switches to spans, resets to start_time
  it('resets orderBy from span_count to start_time when switching to spans mode', () => {
    store.ensureLoaded();
    store.setOrderBy('span_count');
    store.setMode('spans');
    expect(store.orderBy()).toBe('start_time');
  });

  // AC-2 #7: setOrderBy triggers new request with correct orderBy
  it('setOrderBy() passes new field to stream (AC-2 #7)', () => {
    store.ensureLoaded();
    store.setOrderBy('duration_ns');
    const lastCall = mockStream.mock.calls[mockStream.mock.calls.length - 1];
    expect(lastCall[1].orderBy).toBe('duration_ns');
  });

  // AC-2 #8: setDirection toggles and issues request
  it('setDirection() passes new direction to stream (AC-2 #8)', () => {
    store.ensureLoaded();
    store.setDirection('ASC');
    const lastCall = mockStream.mock.calls[mockStream.mock.calls.length - 1];
    expect(lastCall[1].direction).toBe('ASC');
    expect(store.direction()).toBe('ASC');
  });

  // AC-4 #23: switching from builder to raw copies compiled condition
  it('setFilterMode("raw") copies compiledCondition into rawCondition (AC-4 #23)', () => {
    // Set up some builder rows that will produce a compiled condition
    store.setBuilderRows([
      { id: 'r1', field: 'service_name', operator: '=', value: 'api' },
    ]);
    store.setFilterMode('raw');
    expect(store.rawCondition()).toBe("service_name = 'api'");
    expect(store.filterMode()).toBe('raw');
  });

  // AC-4 #24: switching from raw to builder clears builder rows
  it('setFilterMode("builder") clears builder rows (AC-4 #24)', () => {
    store.setFilterMode('raw');
    store.setRawCondition("service_name = 'api'");
    store.setBuilderRows([{ id: 'r1', field: 'service_name', operator: '=', value: 'api' }]);
    store.setFilterMode('builder');
    expect(store.builderRows()).toHaveLength(0);
    expect(store.filterMode()).toBe('builder');
  });

  // AC-3 #13: compiledCondition reflects raw input in raw mode
  it('compiledCondition returns raw input verbatim in raw mode (AC-3 #13)', () => {
    store.setFilterMode('raw');
    store.setRawCondition("service_name = 'api'");
    expect(store.compiledCondition()).toBe("service_name = 'api'");
  });

  // AC-4 #19: compiledCondition updates as builder rows change
  // duration_ns value is entered in ms and compiled to ns (ms * 1_000_000)
  it('compiledCondition updates in real time as builder rows change (AC-4 #19)', () => {
    // 1000 ms → 1000 * 1_000_000 = 1_000_000_000 ns
    store.setBuilderRows([
      { id: 'r1', field: 'duration_ns', operator: '>', value: '1000' },
    ]);
    expect(store.compiledCondition()).toBe('duration_ns > 1000000000');

    store.setBuilderRows([
      { id: 'r1', field: 'duration_ns', operator: '>', value: '1000' },
      { id: 'r2', field: 'service_name', operator: '=', value: 'api' },
    ]);
    expect(store.compiledCondition()).toBe("duration_ns > 1000000000 AND service_name = 'api'");
  });

  // AC-6 #35: hasFilter is true when compiledCondition is non-empty
  it('hasFilter is true when condition is non-empty (AC-6 #35)', () => {
    store.setFilterMode('raw');
    store.setRawCondition("service_name = 'api'");
    expect(store.hasFilter()).toBe(true);
  });

  it('hasFilter is false when condition is empty', () => {
    expect(store.hasFilter()).toBe(false);
  });

  // applyFilter triggers a new stream
  it('applyFilter() triggers a new stream', () => {
    store.ensureLoaded();
    store.applyFilter();
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it('refresh() sends date literals resolved while compiledCondition stays plain', () => {
    store.setFilterMode('raw');
    store.setRawCondition("start_time > '2026-10-15 10:00:00'");
    store.applyFilter();
    const lastCall = mockStream.mock.calls[mockStream.mock.calls.length - 1];
    expect(lastCall[1].condition).toBe(
      `start_time > parseDateTime64BestEffort('${localDisplayToIso('2026-10-15 10:00:00')}', 9)`,
    );
    expect(store.compiledCondition()).toBe("start_time > '2026-10-15 10:00:00'");
  });

  // status from handle
  it('status reflects handle status', () => {
    const handle = makeMockHandle('done');
    mockStream.mockReturnValue(handle);
    store.ensureLoaded();
    expect(store.status()).toBe('done');
  });
});
