import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BuilderRow } from '@app/core/models/builder-row.model';
import { QueryBuilderRow } from './query-builder-row';

@Component({
  selector: 'app-query-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QueryBuilderRow],
  template: `
    <div class="builder">
      @for (row of rows(); track row.id; let idx = $index) {
        @if (idx > 0) {
          <button
            class="connector-toggle"
            [attr.aria-label]="'Toggle connector before condition ' + (idx + 1)"
            (click)="toggleConnector(row)"
          >
            {{ row.connector ?? 'AND' }}
          </button>
        }
        <app-query-builder-row
          [row]="row"
          (rowChange)="updateRow($event)"
          (remove)="removeRow(row.id)"
        />
      }
      <button class="add-btn" (click)="addRow()">+ Add condition</button>
    </div>
  `,
  styles: [
    `
      .builder {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .connector-toggle {
        align-self: flex-start;
        padding: 2px var(--space-2);
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--color-accent);
        border: 1px solid var(--color-accent);
        border-radius: 999px;
        transition: background var(--motion-fast) var(--ease-out),
          color var(--motion-fast) var(--ease-out);
        min-width: 2.75rem;
        text-align: center;

        &:hover {
          background: var(--color-accent-soft);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .add-btn {
        align-self: flex-start;
        padding: var(--space-1) var(--space-3);
        font-size: var(--fs-sm);
        color: var(--color-accent);
        border: 1px dashed var(--color-accent);
        border-radius: var(--radius-sm);
        transition: background var(--motion-fast) var(--ease-out);

        &:hover {
          background: var(--color-accent-soft);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }
    `,
  ],
})
export class QueryBuilder {
  readonly rows = input.required<BuilderRow[]>();
  readonly rowsChange = output<BuilderRow[]>();

  protected addRow(): void {
    const newRow: BuilderRow = {
      id: crypto.randomUUID(),
      field: 'service_name',
      operator: '=',
      value: '',
      connector: 'AND',
    };
    this.rowsChange.emit([...this.rows(), newRow]);
  }

  protected updateRow(updated: BuilderRow): void {
    this.rowsChange.emit(this.rows().map((r) => (r.id === updated.id ? updated : r)));
  }

  protected removeRow(id: string): void {
    this.rowsChange.emit(this.rows().filter((r) => r.id !== id));
  }

  protected toggleConnector(row: BuilderRow): void {
    const flipped: BuilderRow = { ...row, connector: (row.connector ?? 'AND') === 'AND' ? 'OR' : 'AND' };
    this.rowsChange.emit(this.rows().map((r) => (r.id === flipped.id ? flipped : r)));
  }
}
