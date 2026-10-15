import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { DurationPipe } from '@app/core/pipes/duration.pipe';
import { StatusCodePipe } from '@app/core/pipes/status-code.pipe';
import { WaterfallRow } from '@app/core/models/trace-detail.model';
import { MIN_BAR_WIDTH_PX } from '@app/core/config/api.config';

const CLAMP_MIN = 0;
const CLAMP_MAX = 1;

@Component({
  selector: 'app-waterfall-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DurationPipe, StatusCodePipe],
  host: { '[class.selected]': 'selected()', style: 'display: contents' },
  template: `
    <!-- Tree cell -->
    <div
      class="tree-cell"
      [class.selected]="selected()"
      [attr.data-span-id]="row().span.spanId"
      [style.padding-left]="row().depth * indentPx + 'px'"
      role="button"
      tabindex="0"
      [attr.aria-label]="row().span.serviceName + ' — ' + row().span.name"
      [attr.aria-pressed]="selected()"
      (click)="select.emit(row().span.spanId)"
      (keydown.enter)="select.emit(row().span.spanId)"
      (keydown.space)="$event.preventDefault(); select.emit(row().span.spanId)"
    >
      @if (row().hasChildren) {
        <button
          class="caret"
          [attr.aria-label]="row().collapsed ? 'Expand' : 'Collapse'"
          [attr.aria-expanded]="!row().collapsed"
          (click)="$event.stopPropagation(); toggle.emit(row().span.spanId)"
        >
          {{ row().collapsed ? '▶' : '▼' }}
        </button>
      } @else {
        <span class="caret-placeholder" aria-hidden="true"></span>
      }
      <span class="service-name">{{ row().span.serviceName }}</span>
      <span class="span-name">{{ row().span.name }}</span>
      <span class="span-meta mono">
        {{ row().span.durationNs | duration }} · {{ row().span.statusCode | statusCode }}
      </span>
    </div>

    <!-- Bar cell -->
    <div
      class="bar-cell"
      [class.selected]="selected()"
      role="button"
      tabindex="-1"
      [attr.aria-hidden]="true"
      (click)="select.emit(row().span.spanId)"
      (mousemove)="onBarMouseMove($event)"
      (mouseleave)="onBarMouseLeave()"
    >
      <div
        class="bar"
        [style.left]="row().offsetPct + '%'"
        [style.width]="row().widthPct + '%'"
        [style.min-width]="minBarWidthPx + 'px'"
        [attr.data-span-id]="row().span.spanId"
      ></div>
      @if (hoverNs() !== null) {
        <div class="hover-line" [style.left.px]="hoverX()"></div>
        <div class="hover-tip mono" [style.left.px]="hoverX()">{{ hoverNs()! | duration }}</div>
      }
    </div>
  `,
  styles: [
    `
      .tree-cell {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        height: 40px;
        padding-right: var(--space-3);
        border-bottom: 1px solid var(--color-border);
        cursor: pointer;
        overflow: hidden;
        transition: background var(--motion-fast) var(--ease-out);

        &:hover,
        &.selected {
          background: var(--color-accent-soft);
        }

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: -2px;
        }
      }

      .caret {
        flex-shrink: 0;
        font-size: var(--fs-xs);
        color: var(--color-dim);
        padding: 0 var(--space-1);
        line-height: 1;

        &:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
      }

      .caret-placeholder {
        display: inline-block;
        width: 16px;
        flex-shrink: 0;
      }

      .service-name {
        font-size: var(--fs-xs);
        color: var(--color-dim);
        flex-shrink: 0;
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .span-name {
        font-size: var(--fs-sm);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .span-meta {
        font-family: var(--font-mono);
        font-size: var(--fs-xs);
        color: var(--color-dim);
        flex-shrink: 0;
        white-space: nowrap;
      }

      .bar-cell {
        position: relative;
        height: 40px;
        border-bottom: 1px solid var(--color-border);
        cursor: pointer;
        transition: background var(--motion-fast) var(--ease-out);

        &:hover,
        &.selected {
          background: var(--color-accent-soft);
        }
      }

      .bar {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 12px;
        background: var(--color-accent);
        border-radius: var(--radius-sm);
        opacity: 0.75;
        transition: opacity var(--motion-fast) var(--ease-out);

        :host(.selected) & {
          opacity: 1;
        }
      }

      .hover-line {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--color-border);
        pointer-events: none;
        z-index: calc(var(--z-modal) - 1);
      }

      .hover-tip {
        position: absolute;
        bottom: calc(50% + 10px);
        transform: translateX(-50%);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 0 var(--space-1);
        font-size: var(--fs-xs);
        color: var(--color-text);
        white-space: nowrap;
        pointer-events: none;
        z-index: var(--z-modal);
      }
    `,
  ],
})
export class WaterfallRowComponent {
  readonly row = input.required<WaterfallRow>();
  readonly durationNs = input.required<number>();
  readonly selected = input.required<boolean>();
  readonly select = output<string>();
  readonly toggle = output<string>();

  protected readonly indentPx = 20;
  protected readonly minBarWidthPx = MIN_BAR_WIDTH_PX;

  protected readonly hoverNs = signal<number | null>(null);
  protected readonly hoverX = signal(0);

  protected onBarMouseMove(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const fraction = Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, (event.clientX - rect.left) / rect.width));
    this.hoverNs.set(fraction * this.durationNs());
    this.hoverX.set(event.clientX - rect.left);
  }

  protected onBarMouseLeave(): void {
    this.hoverNs.set(null);
  }
}
