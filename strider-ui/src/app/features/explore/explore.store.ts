import { computed, inject, Injectable, signal } from '@angular/core';
import {
  API_PATHS,
  DEFAULT_RESULT_LIMIT,
  LIVE_UPDATES_DEBOUNCE_MS,
  LIVE_UPDATES_MAX_WAIT_MS,
  LIVE_UPDATES_STORAGE_KEY,
} from '@app/core/config/api.config';
import { ListQuery } from '@app/core/http/api-url.util';
import { LiveConnection, LiveUpdatesClient } from '@app/core/http/live-updates.client';
import { StreamHandle, NdjsonStreamService } from '@app/core/http/ndjson-stream.service';
import { mapSpanSummary, mapTraceSummary } from '@app/core/mappers/trace.mappers';
import { BuilderRow, FieldDef } from '@app/core/models/builder-row.model';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import {
  Direction,
  FilterMode,
  ListMode,
  OrderByField,
  ResultLimit,
  StreamStatus,
  ViewMode,
} from '@app/core/models/view.types';
import { resolveDateLiterals } from '@app/core/util/date-literal.util';
import {
  freshCondition,
  ListRow,
  maxTs,
  mergeFresh,
  rowKey,
  sortRows,
} from '@app/core/util/live-merge.util';
import { compileCondition, fieldDefsFor } from '@app/core/util/query-builder.util';
import { DEFAULT_VIEW_MODE, isListMode } from '@app/core/util/view-mode.util';

// Filter state used while the stats view is active (filter panel is hidden there)
const DEFAULT_LIST_MODE: ListMode = 'traces';

/** Filter query for one list mode; each mode keeps its own so switching preserves it. */
interface FilterState {
  filterMode: FilterMode;
  rawCondition: string;
  builderRows: BuilderRow[];
}

const EMPTY_FILTER: FilterState = { filterMode: 'builder', rawCondition: '', builderRows: [] };

/** What the last refresh() requested; live updates repeat it, narrowed to fresh rows. */
interface AppliedQuery {
  path: string;
  query: ListQuery;
  mapFn: (raw: unknown) => ListRow;
}

function readLivePreference(): boolean {
  try {
    return localStorage.getItem(LIVE_UPDATES_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeLivePreference(on: boolean): void {
  try {
    localStorage.setItem(LIVE_UPDATES_STORAGE_KEY, String(on));
  } catch {
    // Storage unavailable (private mode, quota): the toggle still works for this session.
  }
}

@Injectable({ providedIn: 'root' })
export class ExploreStore {
  private readonly streamService = inject(NdjsonStreamService);
  private readonly liveClient = inject(LiveUpdatesClient);

  readonly mode = signal<ViewMode>(DEFAULT_VIEW_MODE);
  readonly orderBy = signal<OrderByField>('start_time');
  readonly direction = signal<Direction>('DESC');
  readonly limit = signal<ResultLimit>(DEFAULT_RESULT_LIMIT);
  private readonly filters = signal<Record<ListMode, FilterState>>({
    traces: EMPTY_FILTER,
    spans: EMPTY_FILTER,
  });

  private readonly handle = signal<StreamHandle<TraceSummary | SpanSummary> | null>(null);
  private readonly hasLoaded = signal(false);

  /** Live updates checkbox, persisted in localStorage. */
  readonly liveEnabled = signal(readLivePreference());
  private liveConnection: LiveConnection | null = null;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the first signal of the current burst arrived (epoch ms); null when no fetch is pending. */
  private liveBurstStart: number | null = null;
  private liveFetch: AbortController | null = null;
  private liveRefetchQueued = false;
  private applied: AppliedQuery | null = null;
  /** Rows by rowKey, built from the base load on the first live merge. */
  private rowIndex: Map<string, ListRow> | null = null;
  /** Base rows merged with live updates; null until the first live merge after a refresh. */
  private readonly liveRows = signal<readonly ListRow[] | null>(null);

  readonly isListView = computed(() => isListMode(this.mode()));

  private readonly listMode = computed<ListMode>(() => {
    const m = this.mode();
    return isListMode(m) ? m : DEFAULT_LIST_MODE;
  });

  private readonly filter = computed(() => this.filters()[this.listMode()]);
  readonly filterMode = computed(() => this.filter().filterMode);
  readonly rawCondition = computed(() => this.filter().rawCondition);
  readonly builderRows = computed(() => this.filter().builderRows);

  readonly compiledCondition = computed(() =>
    this.filterMode() === 'raw' ? this.rawCondition() : compileCondition(this.builderRows()),
  );

  readonly rows = computed<readonly (TraceSummary | SpanSummary)[]>(
    () => this.liveRows() ?? this.handle()?.rows() ?? [],
  );

  readonly traceRows = computed<readonly TraceSummary[]>(() =>
    this.mode() === 'traces' ? (this.rows() as TraceSummary[]) : [],
  );

  readonly spanRows = computed<readonly SpanSummary[]>(() =>
    this.mode() === 'spans' ? (this.rows() as SpanSummary[]) : [],
  );

  readonly status = computed<StreamStatus>(() => this.handle()?.status() ?? 'idle');
  readonly streamError = computed(() => this.handle()?.error() ?? null);
  readonly rowCount = computed(() => this.rows().length);

  readonly availableSortFields = computed<OrderByField[]>(() =>
    this.mode() === 'traces'
      ? ['start_time', 'duration_ns', 'span_count']
      : ['start_time', 'duration_ns'],
  );

  readonly builderFields = computed<FieldDef[]>(() => fieldDefsFor(this.listMode()));

  readonly hasFilter = computed(() => this.compiledCondition().trim().length > 0);

  ensureLoaded(): void {
    if (this.hasLoaded() || !this.isListView()) return;
    this.refresh();
  }

  /** Applies a mode coming from the URL and loads it when it is a list mode. */
  activateMode(m: ViewMode): void {
    this.setMode(m);
    this.ensureLoaded();
  }

  setMode(m: ViewMode): void {
    if (m === this.mode()) return;
    this.mode.set(m);
    if (!isListMode(m)) {
      this.cancel();
      return;
    }
    if (this.orderBy() === 'span_count' && m === 'spans') {
      this.orderBy.set('start_time');
    }
    this.refresh();
  }

  setOrderBy(f: OrderByField): void {
    this.orderBy.set(f);
    this.refresh();
  }

  setDirection(d: Direction): void {
    this.direction.set(d);
    this.refresh();
  }

  setLimit(l: ResultLimit): void {
    this.limit.set(l);
    this.refresh();
  }

  setFilterMode(m: FilterMode): void {
    if (m === 'raw') {
      this.patchFilter({ filterMode: m, rawCondition: this.compiledCondition() });
    } else {
      this.patchFilter({ filterMode: m, builderRows: [] });
    }
  }

  setRawCondition(s: string): void {
    this.patchFilter({ rawCondition: s });
  }

  setBuilderRows(rows: BuilderRow[]): void {
    this.patchFilter({ builderRows: rows });
  }

  /** Updates the filter state of the current list mode only. */
  private patchFilter(patch: Partial<FilterState>): void {
    const m = this.listMode();
    this.filters.update((all) => ({ ...all, [m]: { ...all[m], ...patch } }));
  }

  applyFilter(): void {
    this.refresh();
  }

  cancel(): void {
    this.handle()?.cancel();
  }

  setLiveEnabled(on: boolean): void {
    this.liveEnabled.set(on);
    writeLivePreference(on);
    if (on) {
      this.connectLive();
    } else {
      this.disconnectLive();
    }
  }

  /** Opens the live updates connection if the checkbox is set. Called when the view is created. */
  connectLive(): void {
    if (!this.liveEnabled() || this.liveConnection) return;
    this.liveConnection = this.liveClient.connect(() => this.onLiveSignal());
    // Catch up on anything saved while the connection was closed.
    this.scheduleLiveFetch();
  }

  /** Closes the connection and drops pending live work. Called when the view is destroyed. */
  detachLive(): void {
    this.disconnectLive();
    this.cancelLiveFetch();
  }

  private disconnectLive(): void {
    this.liveConnection?.close();
    this.liveConnection = null;
  }

  private onLiveSignal(): void {
    // The checkbox can be cleared while an event is in flight: still load the data it
    // announces, but stop listening.
    if (!this.liveEnabled()) this.disconnectLive();
    this.scheduleLiveFetch();
  }

  /**
   * Debounce with max wait: every signal restarts the LIVE_UPDATES_DEBOUNCE_MS timer, so a
   * burst ends in a single fetch once it goes quiet. The delay is capped so the fetch fires
   * at most LIVE_UPDATES_MAX_WAIT_MS after the burst's first signal, which keeps a steady
   * stream of signals from postponing it forever.
   */
  private scheduleLiveFetch(): void {
    const now = Date.now();
    this.liveBurstStart ??= now;
    if (this.liveTimer !== null) clearTimeout(this.liveTimer);
    const untilDeadline = this.liveBurstStart + LIVE_UPDATES_MAX_WAIT_MS - now;
    const delay = Math.max(0, Math.min(LIVE_UPDATES_DEBOUNCE_MS, untilDeadline));
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      this.liveBurstStart = null;
      this.runLiveFetch();
    }, delay);
  }

  private cancelLiveFetch(): void {
    if (this.liveTimer !== null) clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.liveBurstStart = null;
    this.liveFetch?.abort();
    this.liveFetch = null;
    this.liveRefetchQueued = false;
  }

  /** Fetches rows ingested since the newest one shown and merges them into the list. */
  private runLiveFetch(): void {
    const applied = this.applied;
    if (!applied || !this.isListView() || this.status() === 'error') return;
    if (this.status() === 'streaming') {
      // The base load is still running: try again once it had time to finish.
      this.scheduleLiveFetch();
      return;
    }
    if (this.liveFetch) {
      this.liveRefetchQueued = true;
      return;
    }

    const rows = this.rows();
    const limit = applied.query.limit;
    // Limit reached: keep the connection open, but there is no room for more rows.
    if (limit !== null && rows.length >= limit) return;

    const query: ListQuery = {
      ...applied.query,
      condition: freshCondition(applied.query.condition, maxTs(rows)),
      limit: limit === null ? null : limit - rows.length,
    };
    const ctrl = new AbortController();
    this.liveFetch = ctrl;

    this.streamService
      .fetchAll(applied.path, query, applied.mapFn, ctrl.signal)
      .then((fresh) => {
        if (!ctrl.signal.aborted) this.mergeLiveRows(fresh);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) console.error('live update fetch failed', e);
      })
      .finally(() => {
        if (this.liveFetch !== ctrl) return;
        this.liveFetch = null;
        if (this.liveRefetchQueued) {
          this.liveRefetchQueued = false;
          this.scheduleLiveFetch();
        }
      });
  }

  private mergeLiveRows(fresh: readonly ListRow[]): void {
    if (fresh.length === 0 || !this.applied) return;
    this.rowIndex ??= new Map(this.rows().map((row) => [rowKey(row), row]));
    mergeFresh(this.rowIndex, fresh);
    const { orderBy, direction } = this.applied.query;
    this.liveRows.set(sortRows(this.rowIndex.values(), orderBy, direction));
  }

  private refresh(): void {
    if (!this.isListView()) return;
    this.handle()?.cancel();
    this.cancelLiveFetch();
    this.rowIndex = null;
    this.liveRows.set(null);

    const path = this.mode() === 'traces' ? API_PATHS.traces : API_PATHS.spans;
    const mapFn = (this.mode() === 'traces' ? mapTraceSummary : mapSpanSummary) as (
      raw: unknown,
    ) => ListRow;
    const query: ListQuery = {
      orderBy: this.orderBy(),
      direction: this.direction(),
      condition: resolveDateLiterals(this.compiledCondition()),
      limit: this.limit(),
    };

    this.applied = { path, query, mapFn };
    this.handle.set(this.streamService.stream(path, query, mapFn));
    this.hasLoaded.set(true);
  }
}
