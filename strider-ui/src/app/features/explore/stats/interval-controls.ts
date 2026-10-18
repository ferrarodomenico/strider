import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { INTERVAL_UNIT_OPTIONS, MIN_INTERVAL_VALUE } from '@app/core/config/stats.constants';
import {
  IntervalRangeForm,
  IntervalRangeFormErrors,
} from '@app/core/models/interval-range.model';

// Instance-unique ids so two control sets can coexist on one page.
let nextControlsId = 0;

@Component({
  selector: 'app-interval-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="interval-controls">
      <div class="field">
        <label class="label" [attr.for]="idPrefix + '-value'">Interval</label>
        <input
          type="number"
          class="interval-value"
          [id]="idPrefix + '-value'"
          [attr.min]="minIntervalValue"
          step="1"
          [value]="value().intervalValue"
          [attr.aria-invalid]="errors().interval ? true : null"
          (change)="update({ intervalValue: $any($event.target).value })"
        />
        <select
          aria-label="Interval unit"
          [value]="value().intervalUnit"
          (change)="update({ intervalUnit: $any($event.target).value })"
        >
          @for (option of unitOptions; track option.value) {
            <option [value]="option.value" [selected]="option.value === value().intervalUnit">
              {{ option.label }}
            </option>
          }
        </select>
      </div>

      <div class="field">
        <label class="label" [attr.for]="idPrefix + '-start'">Start</label>
        <input
          type="datetime-local"
          [id]="idPrefix + '-start'"
          [value]="value().start"
          [attr.aria-invalid]="errors().range ? true : null"
          (change)="update({ start: $any($event.target).value })"
        />
        @if (value().start) {
          <button
            type="button"
            class="clear-btn"
            aria-label="Clear start"
            title="Clear"
            (click)="update({ start: '' })"
          >
            ✕
          </button>
        }
      </div>

      <div class="field">
        <label class="label" [attr.for]="idPrefix + '-end'">End</label>
        <input
          type="datetime-local"
          [id]="idPrefix + '-end'"
          [value]="value().end"
          [attr.aria-invalid]="errors().range ? true : null"
          (change)="update({ end: $any($event.target).value })"
        />
        @if (value().end) {
          <button
            type="button"
            class="clear-btn"
            aria-label="Clear end"
            title="Clear"
            (click)="update({ end: '' })"
          >
            ✕
          </button>
        }
      </div>

      <button type="button" class="apply-btn" [disabled]="!canApply()" (click)="apply.emit()">
        Apply
      </button>
    </div>

    <div class="errors">
      @if (errors().interval) {
        <span class="error-msg" role="alert">{{ errors().interval }}</span>
      }
      @if (errors().range) {
        <span class="error-msg" role="alert">{{ errors().range }}</span>
      }
    </div>
  `,
  styleUrl: './interval-controls.scss',
})
export class IntervalControls {
  readonly value = input.required<IntervalRangeForm>();
  readonly errors = input.required<IntervalRangeFormErrors>();
  readonly canApply = input.required<boolean>();

  readonly valueChange = output<IntervalRangeForm>();
  readonly apply = output<void>();

  protected readonly idPrefix = `interval-controls-${nextControlsId++}`;
  protected readonly unitOptions = INTERVAL_UNIT_OPTIONS;
  protected readonly minIntervalValue = MIN_INTERVAL_VALUE;

  protected update(patch: Partial<IntervalRangeForm>): void {
    this.valueChange.emit({ ...this.value(), ...patch });
  }
}
