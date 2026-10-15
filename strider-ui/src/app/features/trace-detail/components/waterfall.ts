import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, ViewChild } from '@angular/core';
import { DurationPipe } from '@app/core/pipes/duration.pipe';
import { WaterfallRow } from '@app/core/models/trace-detail.model';
import { WaterfallRowComponent } from './waterfall-row';

@Component({
  selector: 'app-waterfall',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WaterfallRowComponent, DurationPipe],
  template: `
    <div class="waterfall-container" #container>
      <!-- Time axis -->
      <div class="axis-spacer" aria-hidden="true"></div>
      <div class="axis-bar" aria-label="Time axis">
        <span class="axis-start">0</span>
        <span class="axis-end mono">{{ durationNs() | duration }}</span>
      </div>

      <!-- Span rows -->
      @for (row of rows(); track row.span.spanId) {
        <app-waterfall-row
          [row]="row"
          [durationNs]="durationNs()"
          [selected]="row.span.spanId === selectedSpanId()"
          (select)="spanSelect.emit($event)"
          (toggle)="toggleCollapse.emit($event)"
        />
      }
    </div>
  `,
  styles: [
    `
      .waterfall-container {
        display: grid;
        grid-template-columns: var(--tree-col) 1fr;
        grid-auto-rows: max-content;
        align-content: start;
        overflow-y: auto;
        flex: 1;
      }

      .axis-spacer {
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        height: 28px;
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
      }

      .axis-bar {
        position: sticky;
        top: 0;
        z-index: var(--z-sticky);
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--space-2);
        font-size: var(--fs-xs);
        color: var(--color-dim);
      }

      .axis-start {
        font-weight: 600;
        color: var(--color-text);
      }

      .axis-end {
        font-family: var(--font-mono);
      }
    `,
  ],
})
export class Waterfall implements AfterViewInit {
  readonly rows = input.required<WaterfallRow[]>();
  readonly durationNs = input.required<number>();
  readonly selectedSpanId = input<string | null>(null);
  readonly spanSelect = output<string>();
  readonly toggleCollapse = output<string>();

  @ViewChild('container') private container!: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    // Container ref is available here for scrollToSpan calls
  }

  scrollToSpan(spanId: string): void {
    const el = this.container?.nativeElement?.querySelector(`[data-span-id="${CSS.escape(spanId)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
