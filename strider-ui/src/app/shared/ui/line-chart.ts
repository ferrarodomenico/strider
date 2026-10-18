import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  CategoryScale,
  Chart,
  type ChartConfiguration,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ChartTheme, readChartTheme } from './chart-theme';

// Tree-shaken subset: no Legend, no Filler.
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

export interface LineChartPoint {
  readonly label: string;
  readonly value: number;
}

type LineChartInstance = Chart<'line', number[], string>;

const LINE_WIDTH_PX = 2;
const POINT_RADIUS_PX = 3;

@Component({
  selector: 'app-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart-box">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
  `,
  styles: [
    `
      .chart-box {
        position: relative;
        width: 100%;
        height: 320px;
      }
    `,
  ],
})
export class LineChart {
  readonly points = input.required<readonly LineChartPoint[]>();
  readonly seriesLabel = input.required<string>();
  readonly ariaLabel = input.required<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: LineChartInstance | null = null;

  constructor() {
    afterRenderEffect(() => this.render(this.points(), this.seriesLabel()));
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private render(points: readonly LineChartPoint[], seriesLabel: string): void {
    if (this.chart) {
      this.updateChart(this.chart, points, seriesLabel);
    } else {
      this.createChart(points, seriesLabel);
    }
  }

  private createChart(points: readonly LineChartPoint[], seriesLabel: string): void {
    const canvas = this.canvas().nativeElement;
    const config = buildLineChartConfig(points, seriesLabel, readChartTheme(canvas));
    this.chart = new Chart(canvas, config);
  }

  private updateChart(
    chart: LineChartInstance,
    points: readonly LineChartPoint[],
    seriesLabel: string,
  ): void {
    const [dataset] = chart.data.datasets;
    chart.data.labels = points.map((point) => point.label);
    dataset.data = points.map((point) => point.value);
    dataset.label = seriesLabel;
    chart.update();
  }
}

function buildLineChartConfig(
  points: readonly LineChartPoint[],
  seriesLabel: string,
  theme: ChartTheme,
): ChartConfiguration<'line', number[], string> {
  const font = { family: theme.fontFamily, size: theme.fontSizePx };
  const axisStyle = { grid: { color: theme.grid }, border: { color: theme.grid } };

  return {
    type: 'line',
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: seriesLabel,
          data: points.map((point) => point.value),
          borderColor: theme.line,
          backgroundColor: theme.line,
          pointBackgroundColor: theme.line,
          borderWidth: LINE_WIDTH_PX,
          pointRadius: POINT_RADIUS_PX,
          tension: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'category',
          ticks: { color: theme.tick, font, maxRotation: 0, autoSkip: true },
          ...axisStyle,
        },
        y: {
          type: 'linear',
          beginAtZero: true,
          ticks: { color: theme.tick, font, precision: 0 },
          ...axisStyle,
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: theme.tooltipBackground,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.grid,
          borderWidth: 1,
          titleFont: font,
          bodyFont: font,
        },
      },
    },
  };
}
