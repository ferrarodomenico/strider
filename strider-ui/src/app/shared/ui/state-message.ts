import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-state-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'loading') {
      <div class="state-message state-message--loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <span class="sr-only">Loading</span>
        <span class="label">Loading…</span>
      </div>
    } @else {
      <div class="state-message state-message--{{ variant() }}" role="alert">
        <span class="label">{{ message() }}</span>
      </div>
    }
  `,
  styles: [
    `
      .state-message {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        padding: var(--space-6);
        color: var(--color-dim);
        font-size: var(--fs-sm);
      }

      .state-message--error .label {
        color: var(--color-accent);
      }

      .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid var(--color-border);
        border-top-color: var(--color-accent);
        border-radius: 50%;
        animation: spin 0.75s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation: none;
          border-top-color: var(--color-dim);
        }
      }
    `,
  ],
})
export class StateMessage {
  readonly variant = input<'loading' | 'empty' | 'error'>('loading');
  readonly message = input<string>('');
}
