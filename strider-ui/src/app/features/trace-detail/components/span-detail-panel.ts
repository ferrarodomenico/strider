import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DurationPipe } from '@app/core/pipes/duration.pipe';
import { LocalDateTimePipe } from '@app/core/pipes/local-datetime.pipe';
import { SpanKindPipe } from '@app/core/pipes/span-kind.pipe';
import { StatusBadge } from '@app/shared/ui/status-badge';
import { Span } from '@app/core/models/span.model';

@Component({
  selector: 'app-span-detail-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DurationPipe, LocalDateTimePipe, SpanKindPipe, StatusBadge],
  template: `
    @if (span()) {
      <div class="panel">
        <h2 class="panel-title">Span Detail</h2>
        <dl class="field-list">
          <div class="field">
            <dt>Trace ID</dt>
            <dd class="mono">{{ span()!.traceId }}</dd>
          </div>
          <div class="field">
            <dt>Span ID</dt>
            <dd class="mono">{{ span()!.spanId }}</dd>
          </div>
          <div class="field">
            <dt>Parent Span ID</dt>
            <dd class="mono">{{ span()!.parentSpanId || '—' }}</dd>
          </div>
          <div class="field">
            <dt>Service</dt>
            <dd>{{ span()!.serviceName }}</dd>
          </div>
          <div class="field">
            <dt>Name</dt>
            <dd>{{ span()!.name }}</dd>
          </div>
          <div class="field">
            <dt>Kind</dt>
            <dd>{{ span()!.kind | spanKind }}</dd>
          </div>
          <div class="field">
            <dt>Start Time</dt>
            <dd>{{ span()!.startTime | localDateTime }}</dd>
          </div>
          <div class="field">
            <dt>Duration</dt>
            <dd class="mono">{{ span()!.durationNs | duration }}</dd>
          </div>
          <div class="field">
            <dt>Status</dt>
            <dd><app-status-badge [code]="span()!.statusCode" /></dd>
          </div>
          @if (span()!.statusMessage) {
            <div class="field">
              <dt>Message</dt>
              <dd>{{ span()!.statusMessage }}</dd>
            </div>
          }
        </dl>

        @if (objectKeys(span()!.attributes).length > 0) {
          <section class="attr-section">
            <h3 class="attr-title">Attributes</h3>
            <dl class="attr-list">
              @for (key of objectKeys(span()!.attributes); track key) {
                <div class="attr-item">
                  <dt class="mono">{{ key }}</dt>
                  <dd class="mono">{{ span()!.attributes[key] }}</dd>
                </div>
              }
            </dl>
          </section>
        }

        @if (objectKeys(span()!.resourceAttributes).length > 0) {
          <section class="attr-section">
            <h3 class="attr-title">Resource Attributes</h3>
            <dl class="attr-list">
              @for (key of objectKeys(span()!.resourceAttributes); track key) {
                <div class="attr-item">
                  <dt class="mono">{{ key }}</dt>
                  <dd class="mono">{{ span()!.resourceAttributes[key] }}</dd>
                </div>
              }
            </dl>
          </section>
        }
      </div>
    } @else {
      <div class="panel-empty">
        <p class="empty-hint">Select a span to see details</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .panel {
        padding: var(--space-4);
      }

      .panel-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: var(--space-4);
      }

      .empty-hint {
        font-size: var(--fs-sm);
        color: var(--color-dim);
        text-align: center;
      }

      .panel-title {
        font-size: var(--fs-sm);
        font-weight: 600;
        color: var(--color-dim);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: var(--space-3);
      }

      .field-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--space-2) var(--space-4);
        margin-bottom: var(--space-4);
      }

      .field {
        dt {
          font-size: var(--fs-xs);
          color: var(--color-dim);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }

        dd {
          font-size: var(--fs-sm);
          color: var(--color-text);
          overflow-wrap: break-word;

          &.mono {
            font-family: var(--font-mono);
            font-size: var(--fs-xs);
          }
        }
      }

      .attr-section {
        margin-top: var(--space-4);
      }

      .attr-title {
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--color-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: var(--space-2);
      }

      .attr-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .attr-item {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) 2fr;
        gap: var(--space-2);
        font-size: var(--fs-xs);

        dt {
          font-family: var(--font-mono);
          color: var(--color-dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        dd {
          font-family: var(--font-mono);
          color: var(--color-text);
          overflow-wrap: break-word;
        }
      }
    `,
  ],
})
export class SpanDetailPanel {
  readonly span = input<Span | null>(null);

  protected readonly objectKeys = Object.keys;
}
