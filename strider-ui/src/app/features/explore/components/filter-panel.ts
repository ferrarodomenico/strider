import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { BuilderRow } from '@app/core/models/builder-row.model';
import { FilterMode } from '@app/core/models/view.types';
import { QueryBuilder } from './query-builder';
import { RawConditionInput } from './raw-condition-input';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RawConditionInput, QueryBuilder],
  template: `
    <div class="filter-panel">
      <!-- Panel header — always visible -->
      <div class="panel-header">
        <button
          class="panel-toggle"
          [attr.aria-expanded]="!collapsed()"
          aria-controls="filter-body"
          (click)="collapsed.set(!collapsed())"
        >
          <span class="chevron" [class.expanded]="!collapsed()">›</span>
          <span class="panel-label">Filters</span>
          @if (compiled()) {
            <span class="active-dot" aria-label="Filter active"></span>
          }
        </button>
      </div>

      <!-- Collapsible filter body -->
      @if (!collapsed()) {
        <div id="filter-body" class="filter-body">
          <!-- Mode switch -->
          <div class="mode-switch" role="radiogroup" aria-label="Filter mode">
            <button
              role="radio"
              [attr.aria-checked]="filterMode() === 'raw'"
              [class.active]="filterMode() === 'raw'"
              (click)="filterModeChange.emit('raw')"
            >
              Raw
            </button>
            <button
              role="radio"
              [attr.aria-checked]="filterMode() === 'builder'"
              [class.active]="filterMode() === 'builder'"
              (click)="filterModeChange.emit('builder')"
            >
              Builder
            </button>
          </div>

          <!-- Active input mode -->
          <div class="input-area">
            @switch (filterMode()) {
              @case ('raw') {
                <app-raw-condition-input
                  [value]="rawCondition()"
                  (valueChange)="rawConditionChange.emit($event)"
                  (submit)="apply.emit()"
                />
              }
              @case ('builder') {
                <app-query-builder [rows]="rows()" (rowsChange)="rowsChange.emit($event)" />
              }
            }
          </div>

          <!-- Compiled condition display -->
          <div class="compiled-row">
            <span class="compiled-label">SQL</span>
            <output
              class="compiled-display mono"
              [attr.aria-label]="'Compiled condition: ' + compiled()"
            >
              {{ compiled() || '(no filter)' }}
            </output>
          </div>

          <!-- Apply -->
          <button class="apply-btn" (click)="apply.emit()">Apply</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .filter-panel {
        display: flex;
        flex-direction: column;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }

      .panel-header {
        display: flex;
        align-items: center;
        padding: var(--space-1) var(--space-3);
      }

      .panel-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--fs-sm);
        color: var(--color-dim);
        padding: var(--space-1) 0;
        transition: color var(--motion-fast) var(--ease-out);

        &:hover {
          color: var(--color-text);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
          border-radius: var(--radius-sm);
        }
      }

      .panel-label {
        font-weight: 500;
      }

      .active-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-accent);
        flex-shrink: 0;
      }

      .chevron {
        display: inline-block;
        font-size: var(--fs-base);
        transition: transform var(--motion-fast) var(--ease-out);
        transform: rotate(0deg);

        &.expanded {
          transform: rotate(90deg);
        }
      }

      .filter-body {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3) var(--space-3);
        border-top: 1px solid var(--color-border);
      }

      .mode-switch {
        display: inline-flex;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        overflow: hidden;
        align-self: flex-start;

        button {
          padding: var(--space-1) var(--space-3);
          font-size: var(--fs-xs);
          color: var(--color-dim);
          transition:
            background var(--motion-fast) var(--ease-out),
            color var(--motion-fast) var(--ease-out);

          &.active {
            background: var(--color-surface-2);
            color: var(--color-text);
          }

          &:focus-visible {
            outline: 2px solid var(--color-accent);
            outline-offset: -2px;
          }
        }
      }

      .compiled-row {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        font-size: var(--fs-xs);
      }

      .compiled-label {
        color: var(--color-dim);
        flex-shrink: 0;
        padding-top: 2px;
      }

      .compiled-display {
        font-family: var(--font-mono);
        color: var(--color-dim);
        word-break: break-all;
        flex: 1;
      }

      .apply-btn {
        align-self: flex-start;
        padding: var(--space-1) var(--space-3);
        background: var(--color-accent);
        color: var(--color-bg);
        font-size: var(--fs-sm);
        font-weight: 600;
        border-radius: var(--radius-sm);
        transition: opacity var(--motion-fast) var(--ease-out);

        &:hover {
          opacity: 0.85;
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class FilterPanel {
  readonly filterMode = input.required<FilterMode>();
  readonly rawCondition = input.required<string>();
  readonly rows = input.required<BuilderRow[]>();
  readonly compiled = input.required<string>();
  readonly filterModeChange = output<FilterMode>();
  readonly rawConditionChange = output<string>();
  readonly rowsChange = output<BuilderRow[]>();
  readonly apply = output<void>();

  protected readonly collapsed = signal(true);
}
