import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatsSection } from './stats-section';
import { TracesOverTimeGraph } from './traces-over-time/traces-over-time-graph';

@Component({
  selector: 'app-stats-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatsSection, TracesOverTimeGraph],
  template: `
    <div class="stats-view">
      <app-stats-section heading="Traces over time">
        <app-traces-over-time-graph />
      </app-stats-section>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      .stats-view {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
    `,
  ],
})
export class StatsView {}
