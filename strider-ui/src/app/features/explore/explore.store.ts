import { computed, inject, Injectable, signal } from '@angular/core';
import { API_PATHS } from '@app/core/config/api.config';
import { StreamHandle, NdjsonStreamService } from '@app/core/http/ndjson-stream.service';
import { mapSpanSummary, mapTraceSummary } from '@app/core/mappers/trace.mappers';
import { BuilderRow } from '@app/core/models/builder-row.model';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import {
  Direction,
  FilterMode,
  OrderByField,
  StreamStatus,
  ViewMode,
} from '@app/core/models/view.types';
import { resolveDateLiterals } from '@app/core/util/date-literal.util';
import { compileCondition } from '@app/core/util/query-builder.util';
import { DEFAULT_VIEW_MODE, isListMode } from '@app/core/util/view-mode.util';

@Injectable({ providedIn: 'root' })
export class ExploreStore {
  private readonly streamService = inject(NdjsonStreamService);

  readonly mode = signal<ViewMode>(DEFAULT_VIEW_MODE);
  readonly orderBy = signal<OrderByField>('start_time');
  readonly direction = signal<Direction>('DESC');
  readonly filterMode = signal<FilterMode>('builder');
  readonly rawCondition = signal<string>('');
  readonly builderRows = signal<BuilderRow[]>([]);

  private readonly handle = signal<StreamHandle<TraceSummary | SpanSummary> | null>(null);
  private readonly hasLoaded = signal(false);

  readonly isListView = computed(() => isListMode(this.mode()));

  readonly compiledCondition = computed(() =>
    this.filterMode() === 'raw' ? this.rawCondition() : compileCondition(this.builderRows()),
  );

  readonly rows = computed<readonly (TraceSummary | SpanSummary)[]>(
    () => this.handle()?.rows() ?? [],
  );

  readonly traceRows = computed<readonly TraceSummary[]>(() =>
    this.mode() === 'traces' ? (this.rows() as TraceSummary[]) : [],
  );

  readonly spanRows = computed<readonly SpanSummary[]>(() =>
    this.mode() === 'spans' ? (this.rows() as SpanSummary[]) : [],
  );

  readonly status = computed<StreamStatus>(() => this.handle()?.status() ?? 'idle');
  readonly streamError = computed(() => this.handle()?.error() ?? null);
  readonly capReached = computed(() => this.handle()?.capReached() ?? false);
  readonly rowCount = computed(() => this.rows().length);

  readonly availableSortFields = computed<OrderByField[]>(() =>
    this.mode() === 'traces'
      ? ['start_time', 'duration_ns', 'span_count']
      : ['start_time', 'duration_ns'],
  );

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

  setFilterMode(m: FilterMode): void {
    if (m === 'raw') {
      this.rawCondition.set(this.compiledCondition());
    } else {
      this.builderRows.set([]);
    }
    this.filterMode.set(m);
  }

  setRawCondition(s: string): void {
    this.rawCondition.set(s);
  }

  setBuilderRows(rows: BuilderRow[]): void {
    this.builderRows.set(rows);
  }

  applyFilter(): void {
    this.refresh();
  }

  cancel(): void {
    this.handle()?.cancel();
  }

  private refresh(): void {
    if (!this.isListView()) return;
    this.handle()?.cancel();

    const path = this.mode() === 'traces' ? API_PATHS.traces : API_PATHS.spans;
    const mapFn = this.mode() === 'traces' ? mapTraceSummary : mapSpanSummary;

    const newHandle = this.streamService.stream(
      path,
      {
        orderBy: this.orderBy(),
        direction: this.direction(),
        condition: resolveDateLiterals(this.compiledCondition()),
      },
      mapFn as (raw: unknown) => TraceSummary | SpanSummary,
    );

    this.handle.set(newHandle);
    this.hasLoaded.set(true);
  }
}
