import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ViewMode } from '@app/core/models/view.types';

@Component({
  selector: 'app-mode-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toggle" role="tablist" aria-label="View mode">
      <button
        role="tab"
        [attr.aria-selected]="mode() === 'traces'"
        [class.active]="mode() === 'traces'"
        (click)="modeChange.emit('traces')"
      >
        Traces
      </button>
      <button
        role="tab"
        [attr.aria-selected]="mode() === 'spans'"
        [class.active]="mode() === 'spans'"
        (click)="modeChange.emit('spans')"
      >
        Spans
      </button>
    </div>
  `,
  styles: [
    `
      .toggle {
        display: inline-flex;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      button {
        padding: var(--space-2) var(--space-4);
        font-size: var(--fs-sm);
        color: var(--color-dim);
        transition: background var(--motion-fast) var(--ease-out),
          color var(--motion-fast) var(--ease-out);

        &.active {
          background: var(--color-accent);
          color: var(--color-bg);
          font-weight: 600;
        }

        &:not(.active):hover {
          background: var(--color-surface);
          color: var(--color-text);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: -2px;
        }
      }
    `,
  ],
})
export class ModeToggle {
  readonly mode = input.required<ViewMode>();
  readonly modeChange = output<ViewMode>();
}
