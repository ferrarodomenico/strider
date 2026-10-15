import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DurationPipe } from '@app/core/pipes/duration.pipe';
import { LocalDateTimePipe } from '@app/core/pipes/local-datetime.pipe';
import { SpanKindPipe } from '@app/core/pipes/span-kind.pipe';
import { StatusCodePipe } from '@app/core/pipes/status-code.pipe';
import { SpanSummary } from '@app/core/models/span-summary.model';
import { TraceSummary } from '@app/core/models/trace-summary.model';
import { ViewMode } from '@app/core/models/view.types';
import { ROW_HEIGHT_PX } from '@app/core/config/api.config';

export interface RowClickEvent {
  traceId: string;
  spanId?: string;
}

@Component({
  selector: 'app-results-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule, DurationPipe, LocalDateTimePipe, SpanKindPipe, StatusCodePipe],
  template: `
    <div class="table-scroll">
      @switch (mode()) {
        @case ('traces') {
          <div class="table" style="min-width: 800px">
            <!-- Header -->
            <div class="row row--header" role="row">
              <span class="cell" role="columnheader">Trace ID</span>
              <span class="cell" role="columnheader">Root Name</span>
              <span class="cell" role="columnheader">Service</span>
              <span class="cell" role="columnheader">Start Time</span>
              <span class="cell" role="columnheader">Duration</span>
              <span class="cell cell--narrow" role="columnheader">Spans</span>
            </div>
            <!-- Virtual rows -->
            <cdk-virtual-scroll-viewport [itemSize]="rowHeightPx" class="viewport">
              <button
                *cdkVirtualFor="let row of traceRows(); trackBy: trackTraceRow"
                class="row row--data"
                role="button"
                [title]="row.traceId"
                [attr.aria-label]="'Trace ' + row.traceId + ', ' + row.rootName"
                (click)="rowClick.emit({ traceId: row.traceId })"
                (keydown.enter)="rowClick.emit({ traceId: row.traceId })"
                (keydown.space)="rowClick.emit({ traceId: row.traceId })"
              >
                <span class="cell mono">{{ row.traceId.slice(0, 8) }}…</span>
                <span class="cell">{{ row.rootName }}</span>
                <span class="cell">{{ row.serviceName }}</span>
                <span class="cell">{{ row.startTime | localDateTime }}</span>
                <span class="cell mono">{{ row.durationNs | duration }}</span>
                <span class="cell cell--narrow">{{ row.spanCount }}</span>
              </button>
            </cdk-virtual-scroll-viewport>
          </div>
        }
        @case ('spans') {
          <div class="table" style="min-width: 1100px">
            <!-- Header -->
            <div class="row row--header" role="row">
              <span class="cell" role="columnheader">Span ID</span>
              <span class="cell" role="columnheader">Trace ID</span>
              <span class="cell" role="columnheader">Service</span>
              <span class="cell" role="columnheader">Name</span>
              <span class="cell cell--narrow" role="columnheader">Kind</span>
              <span class="cell" role="columnheader">Start Time</span>
              <span class="cell" role="columnheader">Duration</span>
              <span class="cell cell--narrow" role="columnheader">Status</span>
            </div>
            <!-- Virtual rows -->
            <cdk-virtual-scroll-viewport [itemSize]="rowHeightPx" class="viewport">
              <button
                *cdkVirtualFor="let row of spanRows(); trackBy: trackSpanRow"
                class="row row--data"
                role="button"
                [title]="row.spanId"
                [attr.aria-label]="'Span ' + row.spanId + ' from trace ' + row.traceId"
                (click)="rowClick.emit({ traceId: row.traceId, spanId: row.spanId })"
                (keydown.enter)="rowClick.emit({ traceId: row.traceId, spanId: row.spanId })"
                (keydown.space)="rowClick.emit({ traceId: row.traceId, spanId: row.spanId })"
              >
                <span class="cell mono">{{ row.spanId.slice(0, 8) }}…</span>
                <span class="cell mono">{{ row.traceId.slice(0, 8) }}…</span>
                <span class="cell">{{ row.serviceName }}</span>
                <span class="cell">{{ row.name }}</span>
                <span class="cell cell--narrow">{{ row.kind | spanKind }}</span>
                <span class="cell">{{ row.startTime | localDateTime }}</span>
                <span class="cell mono">{{ row.durationNs | duration }}</span>
                <span class="cell cell--narrow">{{ row.statusCode | statusCode }}</span>
              </button>
            </cdk-virtual-scroll-viewport>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      .table-scroll {
        overflow-x: auto;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      .table {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      .viewport {
        flex: 1;
        min-height: 0;
      }

      .row {
        display: grid;
        align-items: center;
        height: 40px;
        width: 100%;
      }

      .row--header {
        grid-template-columns: inherit;
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--color-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0 var(--space-4);
      }

      // Traces columns
      .table[style*='800px'] .row {
        grid-template-columns: 100px 1fr 1fr 160px 90px 60px;
        gap: var(--space-3);
        padding: 0 var(--space-4);
      }

      // Spans columns
      .table[style*='1100px'] .row {
        grid-template-columns: 100px 100px 1fr 1fr 80px 160px 90px 70px;
        gap: var(--space-3);
        padding: 0 var(--space-4);
      }

      .row--data {
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        border-bottom: 1px solid var(--color-border);
        transition: background var(--motion-fast) var(--ease-out);

        &:hover {
          background: var(--color-surface);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: -2px;
        }
      }

      .cell {
        font-size: var(--fs-sm);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        &.mono {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-dim);
        }
      }

      .cell--narrow {
        flex-shrink: 0;
      }
    `,
  ],
})
export class ResultsList {
  readonly mode = input.required<ViewMode>();
  readonly traceRows = input.required<readonly TraceSummary[]>();
  readonly spanRows = input.required<readonly SpanSummary[]>();
  readonly rowClick = output<RowClickEvent>();

  protected readonly rowHeightPx = ROW_HEIGHT_PX;

  protected trackTraceRow(_index: number, row: TraceSummary): string {
    return row.traceId;
  }

  protected trackSpanRow(_index: number, row: SpanSummary): string {
    return row.spanId;
  }
}
