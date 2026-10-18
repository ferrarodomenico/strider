import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stats-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="stats-section" [attr.aria-label]="heading()">
      <h2 class="heading">{{ heading() }}</h2>
      <ng-content />
    </section>
  `,
  styleUrl: './stats-section.scss',
})
export class StatsSection {
  readonly heading = input.required<string>();
}
