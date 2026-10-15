import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Direction, OrderByField } from '@app/core/models/view.types';

const FIELD_LABELS: Record<OrderByField, string> = {
  start_time: 'Start Time',
  duration_ns: 'Duration',
  span_count: 'Span Count',
};

@Component({
  selector: 'app-sort-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sort-controls">
      <label class="label" for="sort-field">Sort by</label>
      <select
        id="sort-field"
        [value]="orderBy()"
        (change)="onFieldChange($event)"
        aria-label="Sort field"
      >
        @for (field of fields(); track field) {
          <option [value]="field" [selected]="field === orderBy()">{{ fieldLabel(field) }}</option>
        }
      </select>
      <button
        class="direction-btn"
        (click)="onDirectionToggle()"
        [attr.aria-label]="'Direction: ' + direction() + '. Click to toggle.'"
        title="Toggle sort direction"
      >
        {{ direction() === 'ASC' ? '▲' : '▼' }}
        <span class="sr-only">{{ direction() }}</span>
      </button>
    </div>
  `,
  styles: [
    `
      .sort-controls {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .label {
        font-size: var(--fs-sm);
        color: var(--color-dim);
      }

      select {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-1) var(--space-2);
        font-size: var(--fs-sm);
        color: var(--color-text);

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .direction-btn {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: var(--space-1) var(--space-2);
        font-size: var(--fs-sm);
        color: var(--color-text);
        min-width: 32px;

        &:hover {
          background: var(--color-surface-2);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class SortControls {
  readonly fields = input.required<OrderByField[]>();
  readonly orderBy = input.required<OrderByField>();
  readonly direction = input.required<Direction>();
  readonly orderByChange = output<OrderByField>();
  readonly directionChange = output<Direction>();

  protected fieldLabel(field: OrderByField): string {
    return FIELD_LABELS[field];
  }

  protected onFieldChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as OrderByField;
    this.orderByChange.emit(value);
  }

  protected onDirectionToggle(): void {
    this.directionChange.emit(this.direction() === 'ASC' ? 'DESC' : 'ASC');
  }
}
