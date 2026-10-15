import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StateMessage } from '@app/shared/ui/state-message';
import { ExploreStore } from './explore.store';
import { FilterPanel } from './components/filter-panel';
import { ModeToggle } from './components/mode-toggle';
import { ResultsList, RowClickEvent } from './components/results-list';
import { SortControls } from './components/sort-controls';
import { StreamStatusBar } from './components/stream-status-bar';

@Component({
  selector: 'app-explore-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModeToggle, SortControls, FilterPanel, StreamStatusBar, ResultsList, StateMessage],
  templateUrl: './explore.view.html',
  styleUrl: './explore.view.scss',
})
export class ExploreView implements OnInit {
  protected readonly store = inject(ExploreStore);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.store.ensureLoaded();
  }

  protected onRowClick(ev: RowClickEvent): void {
    if (ev.spanId) {
      this.router.navigate(['/traces', ev.traceId], { queryParams: { spanId: ev.spanId } });
    } else {
      this.router.navigate(['/traces', ev.traceId]);
    }
  }
}
