import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StreamStatus } from '@app/core/models/view.types';

@Component({
  selector: 'app-stream-status-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ARIA live region for screen readers -->
    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ ariaAnnouncement() }}</p>

    <div class="status-bar">
      @if (status() === 'streaming') {
        <span class="indicator">
          <span class="pulse" aria-hidden="true"></span>
          <span class="indicator-label">Streaming…</span>
        </span>
        <button class="stop-btn" (click)="cancel.emit()" aria-label="Stop streaming">Stop</button>
      }

      @if (status() === 'error') {
        <span class="error-msg" role="alert">{{ error() }}</span>
      }

      @if (status() !== 'idle') {
        <span class="row-count" aria-live="off">{{ rowCount() }} row{{ rowCount() === 1 ? '' : 's' }}</span>
      }
    </div>
  `,
  styles: [
    `
      .status-bar {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) 0;
        font-size: var(--fs-xs);
        min-height: 28px;
      }

      .indicator {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--color-accent);
      }

      .pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse-glow 1.4s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.8); }
      }

      @media (prefers-reduced-motion: reduce) {
        .pulse {
          animation: none;
        }
      }

      .indicator-label {
        font-weight: 500;
      }

      .stop-btn {
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font-size: var(--fs-xs);
        color: var(--color-dim);

        &:hover {
          color: var(--color-text);
          border-color: var(--color-dim);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .error-msg {
        color: var(--color-accent);
        font-family: var(--font-mono);
      }

      .row-count {
        color: var(--color-dim);
        margin-left: auto;
      }
    `,
  ],
})
export class StreamStatusBar {
  readonly status = input.required<StreamStatus>();
  readonly error = input<string | null>(null);
  readonly rowCount = input.required<number>();
  readonly cancel = output<void>();

  protected readonly ariaAnnouncement = computed(() => {
    const s = this.status();
    if (s === 'streaming') return 'Streaming results…';
    if (s === 'error') return `Streaming error: ${this.error() ?? 'unknown'}`;
    if (s === 'done') return 'Streaming complete.';
    return '';
  });
}
