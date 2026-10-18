import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { StatusCodePipe } from '@app/core/pipes/status-code.pipe';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusCodePipe],
  template: `<span class="status-badge" [class]="'status-' + code()">{{ code() | statusCode }}</span>`,
  styles: [
    `
      :host {
        display: inline-block;
        flex-shrink: 0;
      }

      .status-badge {
        display: block;
        text-align: center;
        padding: 2px 4px;
        border-radius: 4px;
      }

      .status-0 {
        background-color: #FFAB00;
        color: #000;
      }
      .status-1 {
        background-color: #00C853;
        color: #fff;
      }
      .status-2 {
        background-color: #D50000;
        color: #fff;
      }
    `,
  ],
})
export class StatusBadge {
  readonly code = input.required<number>();
}
