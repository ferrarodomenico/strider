import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import {
  API_BASE_URL,
  LIVE_UPDATES_DEBOUNCE_MS,
  LIVE_UPDATES_MAX_WAIT_MS,
  LIVE_UPDATES_STORAGE_KEY,
} from '@app/core/config/api.config';
import { LiveUpdatesClient } from '@app/core/http/live-updates.client';
import { NdjsonStreamService, StreamHandle } from '@app/core/http/ndjson-stream.service';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import { StreamStatus } from '@app/core/models/view.types';
import { ExploreStore } from './explore.store';

type Row = TraceSummary | SpanSummary;

const trace = (traceId: string, ts: number, patch: Partial<TraceSummary> = {}): TraceSummary => ({
  traceId,
  rootName: 'GET /api',
  serviceName: 'frontend',
  startTime: '2024-01-01T00:00:00Z',
  durationNs: 1_000,
  spanCount: 1,
  ts,
  ...patch,
});

function makeHandle(rows: Row[], status: WritableSignal<StreamStatus>): StreamHandle<Row> {
  return {
    rows: signal<readonly Row[]>(rows).asReadonly(),
    status: status.asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    cancel: vi.fn(),
  };
}

// Lets the fetchAll promise chain (then / catch / finally) settle.
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function elapseDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(LIVE_UPDATES_DEBOUNCE_MS);
  await settle();
}

describe('ExploreStore live updates', () => {
  let baseRows: Row[];
  let baseStatus: WritableSignal<StreamStatus>;
  let fetchAll: ReturnType<typeof vi.fn>;
  let connect: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;
  let emit: () => void;

  function createStore(): ExploreStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ExploreStore,
        {
          provide: NdjsonStreamService,
          useValue: { stream: () => makeHandle(baseRows, baseStatus), fetchAll },
        },
        { provide: LiveUpdatesClient, useValue: { connect } },
        { provide: API_BASE_URL, useValue: '' },
      ],
    });
    return TestBed.inject(ExploreStore);
  }

  /** Loads the base list and turns live updates on. */
  function createLiveStore(): ExploreStore {
    const store = createStore();
    store.ensureLoaded();
    store.setLiveEnabled(true);
    return store;
  }

  /** The query passed to the n-th fetchAll call. */
  const fetchedQuery = (n = 0) => fetchAll.mock.calls[n][1];

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    baseRows = [
      trace('a', 100, { startTime: '2024-01-01T00:00:00Z' }),
      trace('b', 105, { startTime: '2024-01-01T00:00:01Z' }),
    ];
    baseStatus = signal<StreamStatus>('done');
    fetchAll = vi.fn().mockResolvedValue([]);
    close = vi.fn();
    connect = vi.fn((onSignal: () => void) => {
      emit = onSignal;
      return { close };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('checkbox state', () => {
    it('is off by default', () => {
      expect(createStore().liveEnabled()).toBe(false);
    });

    it('restores the state saved in localStorage', () => {
      localStorage.setItem(LIVE_UPDATES_STORAGE_KEY, 'true');
      expect(createStore().liveEnabled()).toBe(true);
    });

    it('saves every change to localStorage', () => {
      const store = createStore();
      store.setLiveEnabled(true);
      expect(localStorage.getItem(LIVE_UPDATES_STORAGE_KEY)).toBe('true');
      store.setLiveEnabled(false);
      expect(localStorage.getItem(LIVE_UPDATES_STORAGE_KEY)).toBe('false');
    });
  });

  describe('connection', () => {
    it('opens when the checkbox is set and closes when it is cleared', () => {
      const store = createStore();
      store.setLiveEnabled(true);
      expect(connect).toHaveBeenCalledTimes(1);

      store.setLiveEnabled(false);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('connectLive() does nothing while the checkbox is cleared', () => {
      createStore().connectLive();
      expect(connect).not.toHaveBeenCalled();
    });

    it('connectLive() does not open a second connection', () => {
      const store = createStore();
      store.setLiveEnabled(true);
      store.connectLive();
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('detachLive() closes the connection but keeps the checkbox state', () => {
      const store = createLiveStore();
      store.detachLive();
      expect(close).toHaveBeenCalledTimes(1);
      expect(store.liveEnabled()).toBe(true);
      expect(localStorage.getItem(LIVE_UPDATES_STORAGE_KEY)).toBe('true');
    });

    it('detachLive() drops a pending fetch', async () => {
      const store = createLiveStore();
      store.detachLive();
      await elapseDebounce();
      expect(fetchAll).not.toHaveBeenCalled();
    });
  });

  describe('burst protection', () => {
    it('coalesces a burst of signals into one fetch', async () => {
      createLiveStore();
      for (let i = 0; i < 5; i++) emit();
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });

    it('waits for a quiet window after the last signal', async () => {
      createLiveStore();
      emit();
      await vi.advanceTimersByTimeAsync(1_500);
      emit();
      await vi.advanceTimersByTimeAsync(1_500);
      expect(fetchAll).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });

    it('fetches within the max wait under a steady stream of signals', async () => {
      createLiveStore();
      // One signal per second: never quiet for the debounce window.
      for (let i = 0; i < 9; i++) {
        await vi.advanceTimersByTimeAsync(1_000);
        emit();
      }
      expect(fetchAll).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(LIVE_UPDATES_MAX_WAIT_MS - 9_000);
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });

    it('runs one request at a time and follows up once it completes', async () => {
      let resolveFetch!: (rows: Row[]) => void;
      fetchAll.mockImplementation(
        () =>
          new Promise<Row[]>((resolve) => {
            resolveFetch = resolve;
          }),
      );
      createLiveStore();
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(1);

      emit();
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(1); // first one still in flight

      resolveFetch([]);
      await settle();
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(2);
    });

    it('starts a new burst after a refresh', async () => {
      const store = createLiveStore();
      for (let i = 0; i < 9; i++) {
        await vi.advanceTimersByTimeAsync(1_000);
        emit();
      }
      store.applyFilter();
      emit();

      // The old burst's deadline (10s) must not carry over.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchAll).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetching fresh rows', () => {
    it('fetches again for signals arriving after the previous fetch', async () => {
      createLiveStore();
      await elapseDebounce();
      emit();
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(2);
    });

    it('asks for rows at or after the newest ts shown', async () => {
      createLiveStore();
      await elapseDebounce();
      expect(fetchedQuery().condition).toBe('ts >= 105');
    });

    it('keeps the applied filter, not unapplied edits', async () => {
      const store = createStore();
      store.setFilterMode('raw');
      store.setRawCondition("service_name = 'api'");
      store.applyFilter();
      store.setRawCondition("service_name = 'edited but not applied'");
      store.setLiveEnabled(true);

      await elapseDebounce();
      expect(fetchedQuery().condition).toBe("(service_name = 'api') AND ts >= 105");
    });

    it('waits for the base load to finish', async () => {
      baseStatus.set('streaming');
      createLiveStore();
      await elapseDebounce();
      expect(fetchAll).not.toHaveBeenCalled();

      baseStatus.set('done');
      await elapseDebounce();
      expect(fetchAll).toHaveBeenCalledTimes(1);
    });

    it('is cancelled by a refresh', async () => {
      const store = createLiveStore();
      store.applyFilter();
      await elapseDebounce();
      expect(fetchAll).not.toHaveBeenCalled();
    });
  });

  describe('merging', () => {
    it('adds new rows, replaces fresher ones and keeps the list sorted', async () => {
      fetchAll.mockResolvedValue([
        trace('b', 110, { startTime: '2024-01-01T00:00:01Z', spanCount: 7 }),
        trace('c', 110, { startTime: '2024-01-01T00:00:02Z' }),
      ]);
      const store = createLiveStore();
      await elapseDebounce();

      // Default order is start_time DESC.
      expect(store.traceRows().map((r) => r.traceId)).toEqual(['c', 'b', 'a']);
      expect(store.traceRows().find((r) => r.traceId === 'b')?.spanCount).toBe(7);
      expect(store.rowCount()).toBe(3);
    });

    it('goes back to the base rows after a refresh', async () => {
      fetchAll.mockResolvedValue([trace('c', 110)]);
      const store = createLiveStore();
      await elapseDebounce();
      expect(store.rowCount()).toBe(3);

      store.applyFilter();
      expect(store.rowCount()).toBe(2);
    });
  });

  describe('limit', () => {
    it('requests only the remaining capacity', async () => {
      const store = createStore();
      store.setLimit(100);
      store.setLiveEnabled(true);
      await elapseDebounce();
      expect(fetchedQuery().limit).toBe(98);
    });

    it('does not fetch once the limit is reached, but stays connected', async () => {
      baseRows = Array.from({ length: 100 }, (_, i) => trace(`t${i}`, 100));
      const store = createStore();
      store.setLimit(100);
      store.setLiveEnabled(true);

      emit();
      await elapseDebounce();
      expect(fetchAll).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    });
  });

  describe('signal received while the checkbox is cleared', () => {
    it('closes the connection but still appends the announced data', async () => {
      fetchAll.mockResolvedValue([trace('c', 110)]);
      const store = createLiveStore();
      await elapseDebounce(); // catch-up fetch on connect
      fetchAll.mockResolvedValue([trace('d', 120)]);

      // Cleared without going through setLiveEnabled, as if the event raced the toggle.
      store.liveEnabled.set(false);
      emit();
      expect(close).toHaveBeenCalledTimes(1);

      await elapseDebounce();
      expect(store.traceRows().map((r) => r.traceId)).toContain('d');
    });
  });
});
