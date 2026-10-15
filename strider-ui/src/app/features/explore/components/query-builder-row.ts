import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { KIND_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from '@app/core/config/otel.constants';
import { BuilderRow, FieldDef } from '@app/core/models/builder-row.model';
import { BuilderField, Operator, RelativeRange, TimeMode } from '@app/core/models/view.types';
import { FIELD_DEFS, fieldDefFor } from '@app/core/util/query-builder.util';

const RELATIVE_RANGES: RelativeRange[] = ['15m', '1h', '24h', '7d'];

@Component({
  selector: 'app-query-builder-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="builder-row">
      <!-- Field selector -->
      <select
        [value]="row().field"
        (change)="onFieldChange($event)"
        aria-label="Filter field"
      >
        @for (def of fieldDefs; track def.field) {
          <option [value]="def.field" [selected]="def.field === row().field">{{ def.label }}</option>
        }
      </select>

      <!-- Operator selector (hidden for relative time) -->
      @if (!(currentDef().valueInput === 'time' && row().timeMode === 'relative')) {
        <select
          [value]="row().operator"
          (change)="onOperatorChange($event)"
          aria-label="Filter operator"
        >
          @for (op of currentDef().operators; track op) {
            <option [value]="op" [selected]="op === row().operator">{{ op }}</option>
          }
        </select>
      }

      <!-- Value input by type -->
      @switch (currentDef().valueInput) {
        @case ('text') {
          <input
            type="text"
            [value]="row().value"
            (input)="onValueChange($event)"
            aria-label="Filter value"
            placeholder="value"
          />
        }
        @case ('number') {
          <input
            type="number"
            [value]="row().value"
            (input)="onValueChange($event)"
            aria-label="Filter value"
            [placeholder]="row().field === 'duration_ns' ? 'value in ms' : '0'"
          />
        }
        @case ('select-kind') {
          <select [value]="row().value" (change)="onValueChange($event)" aria-label="Kind">
            <option value="">— select —</option>
            @for (opt of kindOptions; track opt.value) {
              <option [value]="opt.value" [selected]="String(opt.value) === row().value">
                {{ opt.label }}
              </option>
            }
          </select>
        }
        @case ('select-status') {
          <select [value]="row().value" (change)="onValueChange($event)" aria-label="Status">
            <option value="">— select —</option>
            @for (opt of statusOptions; track opt.value) {
              <option [value]="opt.value" [selected]="String(opt.value) === row().value">
                {{ opt.label }}
              </option>
            }
          </select>
        }
        @case ('time') {
          <div class="time-inputs">
            <!-- Relative / Absolute toggle -->
            <select
              [value]="row().timeMode ?? 'relative'"
              (change)="onTimeModeChange($event)"
              aria-label="Time mode"
            >
              <option value="relative">Relative</option>
              <option value="absolute">Absolute</option>
            </select>

            @if (row().timeMode === 'absolute') {
              <!-- Operator already shown above when absolute -->
              <input
                type="datetime-local"
                [value]="row().value"
                (change)="onValueChange($event)"
                aria-label="Datetime value"
              />
            } @else {
              <select
                [value]="row().relativeRange ?? '1h'"
                (change)="onRelativeRangeChange($event)"
                aria-label="Relative range"
              >
                @for (r of relativeRanges; track r) {
                  <option [value]="r" [selected]="r === row().relativeRange">{{ r }}</option>
                }
              </select>
            }
          </div>
        }
      }

      <button class="remove-btn" (click)="remove.emit()" aria-label="Remove filter row" title="Remove">
        ✕
      </button>
    </div>
  `,
  styles: [
    `
      .builder-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      select,
      input[type='text'],
      input[type='number'],
      input[type='datetime-local'] {
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

      .time-inputs {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }

      .remove-btn {
        color: var(--color-dim);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        font-size: var(--fs-xs);
        flex-shrink: 0;

        &:hover {
          color: var(--color-accent);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class QueryBuilderRow {
  readonly row = input.required<BuilderRow>();
  readonly rowChange = output<BuilderRow>();
  readonly remove = output<void>();

  protected readonly fieldDefs: FieldDef[] = FIELD_DEFS;
  protected readonly kindOptions = KIND_FILTER_OPTIONS;
  protected readonly statusOptions = STATUS_FILTER_OPTIONS;
  protected readonly relativeRanges = RELATIVE_RANGES;
  protected readonly String = String;

  protected currentDef(): FieldDef {
    return fieldDefFor(this.row().field);
  }

  protected onFieldChange(event: Event): void {
    const field = (event.target as HTMLSelectElement).value as BuilderField;
    const def = fieldDefFor(field);
    const isTime = def.valueInput === 'time';
    this.rowChange.emit({
      ...this.row(),
      field,
      operator: def.operators[0],
      value: '',
      timeMode: isTime ? 'relative' : undefined,
      relativeRange: isTime ? '1h' : undefined,
    });
  }

  protected onOperatorChange(event: Event): void {
    const operator = (event.target as HTMLSelectElement).value as Operator;
    this.rowChange.emit({ ...this.row(), operator });
  }

  protected onValueChange(event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.rowChange.emit({ ...this.row(), value });
  }

  protected onTimeModeChange(event: Event): void {
    const timeMode = (event.target as HTMLSelectElement).value as TimeMode;
    this.rowChange.emit({
      ...this.row(),
      timeMode,
      value: '',
      relativeRange: timeMode === 'relative' ? '1h' : undefined,
    });
  }

  protected onRelativeRangeChange(event: Event): void {
    const relativeRange = (event.target as HTMLSelectElement).value as RelativeRange;
    this.rowChange.emit({ ...this.row(), relativeRange });
  }
}
