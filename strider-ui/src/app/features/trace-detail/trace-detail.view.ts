import { afterRenderEffect, ChangeDetectionStrategy, Component, effect, inject, input, untracked, viewChild } from '@angular/core';
import { StateMessage } from '@app/shared/ui/state-message';
import { TraceDetailStore } from './trace-detail.store';
import { SpanDetailPanel } from './components/span-detail-panel';
import { TraceHeader } from './components/trace-header';
import { Waterfall } from './components/waterfall';

@Component({
  selector: 'app-trace-detail-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TraceDetailStore],
  imports: [StateMessage, TraceHeader, Waterfall, SpanDetailPanel],
  templateUrl: './trace-detail.view.html',
  styleUrl: './trace-detail.view.scss',
})
export class TraceDetailView {
  readonly id = input.required<string>();
  readonly spanId = input<string>();

  protected readonly store = inject(TraceDetailStore);
  private readonly waterfallRef = viewChild(Waterfall);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        this.store.load(id);
      }
    });

    effect(() => {
      const status = this.store.status();
      const spanId = this.spanId();
      if (status === 'loaded' && spanId) {
        untracked(() => this.store.selectSpan(spanId));
      }
    });

    afterRenderEffect(() => {
      const status = this.store.status();
      const spanId = this.spanId();
      const waterfall = this.waterfallRef();
      if (status === 'loaded' && spanId) {
        waterfall?.scrollToSpan(spanId);
      }
    });
  }
}
