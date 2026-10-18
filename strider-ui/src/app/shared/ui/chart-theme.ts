export interface ChartTheme {
  line: string;
  grid: string;
  tick: string;
  tooltipBackground: string;
  tooltipText: string;
  fontFamily: string;
  fontSizePx: number;
}

const CHART_TOKENS = {
  line: '--color-accent',
  grid: '--color-border',
  tick: '--color-dim',
  tooltipBackground: '--color-surface-2',
  tooltipText: '--color-text',
  fontFamily: '--font-mono',
  fontSize: '--fs-xs',
} as const;

const FALLBACK_FONT_SIZE_PX = 12;

/** Resolves the chart colors and fonts from the app's CSS design tokens. */
export function readChartTheme(el: Element): ChartTheme {
  const styles = getComputedStyle(el);
  const token = (name: string): string => styles.getPropertyValue(name).trim();
  const rootFontPx = parseFloat(getComputedStyle(el.ownerDocument.documentElement).fontSize);

  return {
    line: token(CHART_TOKENS.line),
    grid: token(CHART_TOKENS.grid),
    tick: token(CHART_TOKENS.tick),
    tooltipBackground: token(CHART_TOKENS.tooltipBackground),
    tooltipText: token(CHART_TOKENS.tooltipText),
    fontFamily: token(CHART_TOKENS.fontFamily),
    fontSizePx: remTokenToPx(token(CHART_TOKENS.fontSize), rootFontPx),
  };
}

function remTokenToPx(value: string, rootFontPx: number): number {
  const px = parseFloat(value) * rootFontPx;
  return Number.isFinite(px) ? px : FALLBACK_FONT_SIZE_PX;
}
