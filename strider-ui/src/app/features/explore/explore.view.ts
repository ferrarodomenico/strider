import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { ViewMode } from '@app/core/models/view.types';
import { MODE_QUERY_PARAM, parseViewMode } from '@app/core/util/view-mode.util';
import { StateMessage } from '@app/shared/ui/state-message';
import { ExploreStore } from './explore.store';
import { FilterPanel } from './components/filter-panel';
import { ModeToggle } from './components/mode-toggle';
import { ResultsList, RowClickEvent } from './components/results-list';
import { SortControls } from './components/sort-controls';
import { StreamStatusBar } from './components/stream-status-bar';
import { StatsView } from './stats/stats-view';

@Component({
  selector: 'app-explore-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModeToggle,
    SortControls,
    FilterPanel,
    StreamStatusBar,
    ResultsList,
    StateMessage,
    StatsView,
  ],
  templateUrl: './explore.view.html',
  styleUrl: './explore.view.scss',
})
export class ExploreView {
  protected readonly store = inject(ExploreStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Bound from ?mode= by withComponentInputBinding. Angular needs a literal alias;
  // keep it equal to MODE_QUERY_PARAM.
  readonly modeParam = input<string | undefined>(undefined, { alias: 'mode' });

  protected readonly statsLoadError = 'Could not load the stats view.';

  constructor() {
    effect(() => {
      const mode = parseViewMode(this.modeParam());
      untracked(() => this.store.activateMode(mode));
    });
  }

  protected onModeChange(mode: ViewMode): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [MODE_QUERY_PARAM]: mode },
      queryParamsHandling: 'merge',
    });
  }

  // Carries the current mode to trace detail so its Back link can restore it.
  protected onRowClick(ev: RowClickEvent): void {
    const queryParams: Params = { [MODE_QUERY_PARAM]: this.store.mode() };
    if (ev.spanId) queryParams['spanId'] = ev.spanId;
    this.router.navigate(['/traces', ev.traceId], { queryParams });
  }
}
