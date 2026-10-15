import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-raw-condition-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="raw-input-wrapper">
      <input
        class="raw-input mono"
        type="text"
        placeholder="e.g. service_name = 'api-gateway'"
        [value]="value()"
        (input)="valueChange.emit($any($event.target).value)"
        (keyup.enter)="submit.emit()"
        aria-label="Raw filter condition"
      />
    </div>
  `,
  styles: [
    `
      .raw-input-wrapper {
        width: 100%;
      }

      .raw-input {
        width: 100%;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-2) var(--space-3);
        font-size: var(--fs-sm);
        color: var(--color-text);

        &::placeholder {
          color: var(--color-dim);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class RawConditionInput {
  readonly value = input.required<string>();
  readonly valueChange = output<string>();
  readonly submit = output<void>();
}
