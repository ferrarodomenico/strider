import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { DEFAULT_INTERVAL_RANGE_FORM } from '@app/core/config/stats.constants';
import { TraceCountClient } from '@app/core/http/trace-count.client';
import { IntervalRangeForm, IntervalRangeQuery } from '@app/core/models/interval-range.model';
import { TraceCountBucket } from '@app/core/models/trace-count.model';
import { LoadStatus } from '@app/core/models/view.types';
import {
  buildIntervalRangeQuery,
  validateIntervalRangeForm,
} from '@app/core/util/interval-range.util';
import { describeHttpError } from '../stats-http-error.util';

@Injectable({ providedIn: 'root' })
export class TracesOverTimeStore {
  private readonly client = inject(TraceCountClient);

  readonly form = signal<IntervalRangeForm>(DEFAULT_INTERVAL_RANGE_FORM);
  readonly status = signal<LoadStatus>('idle');
  readonly error = signal<string | null>(null);
  readonly buckets = signal<readonly TraceCountBucket[]>([]);

  readonly errors = computed(() => validateIntervalRangeForm(this.form()));

  private readonly query = computed(() => buildIntervalRangeQuery(this.form()));
  readonly canApply = computed(() => this.query() !== null);

  private inFlight: Subscription | null = null;

  /** Loads with the current form on first open only. */
  ensureLoaded(): void {
    if (this.status() === 'idle') this.apply();
  }

  /** Stores the controls' values; never fetches. */
  setForm(form: IntervalRangeForm): void {
    this.form.set(form);
  }

  apply(): void {
    const query = this.query();
    if (!query) return;
    this.load(query);
  }

  private load(query: IntervalRangeQuery): void {
    this.inFlight?.unsubscribe();
    this.status.set('loading');
    this.error.set(null);

    this.inFlight = this.client.fetchTraceCounts(query).subscribe({
      next: (buckets) => {
        this.buckets.set(buckets);
        this.status.set('loaded');
      },
      error: (err: unknown) => {
        this.error.set(describeHttpError(err));
        this.status.set('error');
      },
    });
  }
}
