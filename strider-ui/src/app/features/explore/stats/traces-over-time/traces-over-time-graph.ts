import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { LocalDateTimePipe } from '@app/core/pipes/local-datetime.pipe';
import { LineChart, LineChartPoint } from '@app/shared/ui/line-chart';
import { StateMessage } from '@app/shared/ui/state-message';
import { IntervalControls } from '../interval-controls';
import { TracesOverTimeStore } from './traces-over-time.store';

@Component({
  selector: 'app-traces-over-time-graph',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IntervalControls, LineChart, StateMessage],
  providers: [LocalDateTimePipe],
  template: `
    <app-interval-controls
      [value]="store.form()"
      [errors]="store.errors()"
      [canApply]="store.canApply()"
      (valueChange)="store.setForm($event)"
      (apply)="store.apply()"
    />
    @switch (store.status()) {
      @case ('error') {
        <app-state-message variant="error" [message]="store.error() ?? ''" />
      }
      @case ('loaded') {
        @if (points().length === 0) {
          <app-state-message variant="empty" [message]="emptyMessage" />
        } @else {
          <app-line-chart
            [points]="points()"
            [seriesLabel]="seriesLabel"
            [ariaLabel]="chartAriaLabel"
          />
        }
      }
      @default {
        <app-state-message variant="loading" />
      }
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
    `,
  ],
})
export class TracesOverTimeGraph implements OnInit {
  protected readonly store = inject(TracesOverTimeStore);
  // Labels via the app's pipe so the axis matches every other local datetime in the UI.
  private readonly localDateTime = inject(LocalDateTimePipe);

  protected readonly points = computed<LineChartPoint[]>(() =>
    this.store.buckets().map((bucket) => ({
      label: this.localDateTime.transform(bucket.startTime),
      value: bucket.count,
    })),
  );

  protected readonly seriesLabel = 'Traces';
  protected readonly chartAriaLabel = 'Line chart of trace counts per interval';
  protected readonly emptyMessage = 'No traces in the selected range.';

  ngOnInit(): void {
    this.store.ensureLoaded();
  }
}
