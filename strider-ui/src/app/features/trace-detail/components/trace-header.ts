import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { DurationPipe } from '@app/core/pipes/duration.pipe';
import { LocalDateTimePipe } from '@app/core/pipes/local-datetime.pipe';
import { TraceDetail } from '@app/core/models/trace-detail.model';

@Component({
  selector: 'app-trace-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DurationPipe, LocalDateTimePipe, RouterLink],
  template: `
    <header class="trace-header">
      <div class="trace-title">
        <a class="back-btn" routerLink="/" [queryParams]="backQueryParams()" aria-label="Back to results">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </a>
        <span class="label">Trace</span>
        <span class="trace-id mono">{{ trace().traceId }}</span>
      </div>
      <dl class="trace-meta">
        <div class="meta-item">
          <dt>Root</dt>
          <dd>{{ trace().rootName }}</dd>
        </div>
        <div class="meta-item">
          <dt>Service</dt>
          <dd>{{ trace().serviceName }}</dd>
        </div>
        <div class="meta-item">
          <dt>Started</dt>
          <dd>{{ trace().startTime | localDateTime }}</dd>
        </div>
        <div class="meta-item">
          <dt>Duration</dt>
          <dd class="mono">{{ trace().durationNs | duration }}</dd>
        </div>
      </dl>
    </header>
  `,
  styles: [
    `
      .trace-header {
        padding: var(--space-4) var(--space-5);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .trace-title {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .back-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-1) var(--space-3);
        font-size: var(--fs-sm);
        color: var(--color-text);
        text-decoration: none;
        transition: background var(--motion-fast) var(--ease-out);

        &:hover {
          background: var(--color-surface-2);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .label {
        font-size: var(--fs-xs);
        color: var(--color-dim);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
      }

      .trace-id {
        font-family: var(--font-mono);
        font-size: var(--fs-sm);
        color: var(--color-dim);
        overflow-wrap: break-word;
      }

      .trace-meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-4);
      }

      .meta-item {
        display: flex;
        flex-direction: column;
        gap: 2px;

        dt {
          font-size: var(--fs-xs);
          color: var(--color-dim);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        dd {
          font-size: var(--fs-sm);
          color: var(--color-text);
        }
      }
    `,
  ],
})
export class TraceHeader {
  readonly trace = input.required<TraceDetail>();
  readonly backQueryParams = input<Params | null>(null);
}
