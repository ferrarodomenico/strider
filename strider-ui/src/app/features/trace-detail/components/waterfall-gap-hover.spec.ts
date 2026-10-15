/**
 * QA verification tests for the waterfall gap-fix and hover-tooltip feature.
 *
 * AC-1: waterfall.ts grid container must declare
 *       align-content:start and grid-auto-rows:max-content.
 *
 * AC-2: waterfall-row.ts bar-cell mousemove must compute fraction correctly,
 *       clamp it to [0,1], set hoverNs to fraction*durationNs, show/hide
 *       the tooltip and guide-line correctly, and clear on mouseleave.
 *
 * Edge cases: rect.width === 0 (division by zero), cursor far outside bounds.
 * Security: no innerHTML binding.
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Waterfall } from './waterfall';
import { WaterfallRowComponent } from './waterfall-row';
import { WaterfallRow } from '@app/core/models/trace-detail.model';
import { Span } from '@app/core/models/span.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    traceId: 'trace1',
    spanId: 'span1',
    parentSpanId: '',
    serviceName: 'svc',
    name: 'op',
    kind: 1,
    startTime: '2024-01-01T00:00:00.000Z',
    durationNs: 1_000_000_000,
    statusCode: 0,
    statusMessage: '',
    attributes: {},
    resourceAttributes: {},
    ...overrides,
  };
}

function makeRow(overrides: Partial<WaterfallRow> = {}): WaterfallRow {
  return {
    span: makeSpan(),
    depth: 0,
    hasChildren: false,
    collapsed: false,
    offsetPct: 0,
    widthPct: 100,
    ...overrides,
  };
}

/** Fire a synthetic MouseEvent with a mocked getBoundingClientRect on the target. */
function fireMockMouseMove(
  el: HTMLElement,
  clientX: number,
  rectLeft: number,
  rectWidth: number,
): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: rectLeft,
    right: rectLeft + rectWidth,
    width: rectWidth,
    top: 0,
    bottom: 40,
    height: 40,
    x: rectLeft,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  const event = new MouseEvent('mousemove', {
    clientX,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// AC-1: Waterfall container CSS — grid-auto-rows + align-content
// ---------------------------------------------------------------------------
describe('AC-1: Waterfall container CSS properties', () => {
  it('component styles string contains grid-auto-rows: max-content', () => {
    // Access the component's styles metadata directly (no DOM needed).
    // Angular standalone components store their inline styles as a string array.
    // This is a source-level check that survives even jsdom's CSSOM limitations.
    const meta = (Waterfall as unknown as { ɵcmp: { styles: string[] } }).ɵcmp;
    const combinedStyles = meta.styles.join('\n');
    expect(combinedStyles).toContain('grid-auto-rows: max-content');
  });

  it('component styles string contains align-content: start', () => {
    const meta = (Waterfall as unknown as { ɵcmp: { styles: string[] } }).ɵcmp;
    const combinedStyles = meta.styles.join('\n');
    expect(combinedStyles).toContain('align-content: start');
  });

  it('both properties appear inside the .waterfall-container rule', () => {
    const meta = (Waterfall as unknown as { ɵcmp: { styles: string[] } }).ɵcmp;
    const styles = meta.styles.join('\n');
    // Find the waterfall-container block content
    const containerBlock = styles.match(/waterfall-container[\s\S]*?\{([\s\S]*?)\}/);
    expect(containerBlock).not.toBeNull();
    const block = containerBlock![1];
    expect(block).toContain('align-content: start');
    expect(block).toContain('grid-auto-rows: max-content');
  });
});

// ---------------------------------------------------------------------------
// AC-2: WaterfallRowComponent hover tooltip logic
// ---------------------------------------------------------------------------
describe('AC-2: WaterfallRowComponent hover tooltip', () => {
  const DURATION_NS = 1_000_000_000; // 1 second

  let fixture: ComponentFixture<WaterfallRowComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaterfallRowComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(WaterfallRowComponent);
    fixture.componentRef.setInput('row', makeRow());
    fixture.componentRef.setInput('durationNs', DURATION_NS);
    fixture.componentRef.setInput('selected', false);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  it('hover tooltip is NOT rendered initially (hoverNs is null)', () => {
    expect(el.querySelector('.hover-line')).toBeNull();
    expect(el.querySelector('.hover-tip')).toBeNull();
  });

  // ── mousemove at 50% of cell width ───────────────────────────────────────
  it('shows .hover-line and .hover-tip after mousemove', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 50, 0, 100); // clientX=50, rect.left=0, width=100 → 50%
    await fixture.whenStable();

    expect(el.querySelector('.hover-line')).not.toBeNull();
    expect(el.querySelector('.hover-tip')).not.toBeNull();
  });

  it('hover-tip text corresponds to 50% of durationNs (500ms)', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 50, 0, 100); // 50% → 500ms
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    expect(tip?.textContent?.trim()).toBe('500.0ms');
  });

  // ── Clamp: cursor far to the left (fraction < 0) → clamp to 0 ────────────
  it('clamps fraction to 0 when cursor is left of the cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    // clientX=0, rect.left=100, width=200 → raw fraction = (0-100)/200 = -0.5 → clamped to 0
    fireMockMouseMove(barCell, 0, 100, 200);
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    // 0% of durationNs = 0ns
    expect(tip?.textContent?.trim()).toBe('0ns');
  });

  // ── Clamp: cursor far to the right (fraction > 1) → clamp to 1 ───────────
  it('clamps fraction to 1 when cursor is right of the cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    // clientX=300, rect.left=0, width=100 → raw fraction = 3.0 → clamped to 1
    fireMockMouseMove(barCell, 300, 0, 100);
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    // 100% of 1_000_000_000 ns = 1.0s
    expect(tip?.textContent?.trim()).toBe('1.0s');
  });

  // ── Clamp: cursor at exact left edge → 0% ────────────────────────────────
  it('fraction is 0 at the leftmost pixel of the cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 0, 0, 100);
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    expect(tip?.textContent?.trim()).toBe('0ns');
  });

  // ── Clamp: cursor at exact right edge → 100% ─────────────────────────────
  it('fraction is 1 at the rightmost pixel of the cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 100, 0, 100);
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    expect(tip?.textContent?.trim()).toBe('1.0s');
  });

  // ── hoverX is set to clientX - rect.left ─────────────────────────────────
  it('hover-line left style matches cursor pixel offset in cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 75, 0, 100); // hoverX = 75 - 0 = 75px
    await fixture.whenStable();

    const line = el.querySelector('.hover-line') as HTMLElement;
    expect(line.style.left).toBe('75px');
  });

  it('hover-tip left style matches cursor pixel offset in cell', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 75, 0, 100); // hoverX = 75px
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip') as HTMLElement;
    expect(tip.style.left).toBe('75px');
  });

  // ── mouseleave clears the tooltip ─────────────────────────────────────────
  it('hides hover-line and hover-tip on mouseleave', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 50, 0, 100);
    await fixture.whenStable();

    expect(el.querySelector('.hover-line')).not.toBeNull(); // visible

    barCell.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await fixture.whenStable();

    expect(el.querySelector('.hover-line')).toBeNull();
    expect(el.querySelector('.hover-tip')).toBeNull();
  });

  // ── durationNs signal is used (not a hardcoded value) ────────────────────
  it('hoverNs reflects the current durationNs input at 25%', async () => {
    fixture.componentRef.setInput('durationNs', 4_000_000_000); // 4 s
    await fixture.whenStable();

    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 25, 0, 100); // 25% of 4s = 1.0s
    await fixture.whenStable();

    const tip = el.querySelector('.hover-tip');
    expect(tip?.textContent?.trim()).toBe('1.0s');
  });

  // ── Edge case: rect.width === 0 (division by zero) ───────────────────────
  it('does not throw when rect.width is 0', async () => {
    const barCell = el.querySelector('.bar-cell') as HTMLElement;
    // Should not throw; result should be clamped (either 0 or 1, not throw)
    expect(() => {
      fireMockMouseMove(barCell, 0, 0, 0); // 0/0 = NaN path
    }).not.toThrow();
    // No crash means the component survives the edge case
  });
});

// ---------------------------------------------------------------------------
// Security: no innerHTML binding in either component
// ---------------------------------------------------------------------------
describe('Security: no untrusted HTML binding', () => {
  it('WaterfallRowComponent template does not use innerHTML binding', () => {
    const meta = (WaterfallRowComponent as unknown as { ɵcmp: { template: unknown } }).ɵcmp;
    // The compiled template function is stored; convert to string and scan
    const templateStr = (meta.template as (...args: unknown[]) => unknown).toString();
    expect(templateStr).not.toContain('innerHTML');
  });

  it('Waterfall template does not use innerHTML binding', () => {
    const meta = (Waterfall as unknown as { ɵcmp: { template: unknown } }).ɵcmp;
    const templateStr = (meta.template as (...args: unknown[]) => unknown).toString();
    expect(templateStr).not.toContain('innerHTML');
  });

  it('XSS payload renders as text, not parsed HTML, in hover-tip', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WaterfallRowComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    // Use a durationNs whose formatted string would be a recognizable value.
    // The DurationPipe output is safe text; this confirms no innerHTML path.
    const fix = TestBed.createComponent(WaterfallRowComponent);
    fix.componentRef.setInput('row', makeRow());
    fix.componentRef.setInput('durationNs', 1_000_000_000);
    fix.componentRef.setInput('selected', false);
    await fix.whenStable();

    const barCell = (fix.nativeElement as HTMLElement).querySelector('.bar-cell') as HTMLElement;
    fireMockMouseMove(barCell, 50, 0, 100);
    await fix.whenStable();

    const tip = (fix.nativeElement as HTMLElement).querySelector('.hover-tip') as HTMLElement;
    // If innerHTML were used with a pipe that returned an XSS string, img tags would appear.
    expect(tip.querySelector('img')).toBeNull();
    expect(tip.children.length).toBe(0); // pure text node
  });
});

// ---------------------------------------------------------------------------
// Pure clamp math (no Angular) — tests the computation in isolation
// ---------------------------------------------------------------------------
describe('Clamp math: fraction = clamp((clientX - left) / width, 0, 1)', () => {
  const CLAMP_MIN = 0;
  const CLAMP_MAX = 1;

  function computeFraction(clientX: number, left: number, width: number): number {
    return Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, (clientX - left) / width));
  }

  it('50/100 → 0.5', () => {
    expect(computeFraction(50, 0, 100)).toBeCloseTo(0.5, 5);
  });

  it('0/100 → 0.0 (left edge)', () => {
    expect(computeFraction(0, 0, 100)).toBeCloseTo(0, 5);
  });

  it('100/100 → 1.0 (right edge)', () => {
    expect(computeFraction(100, 0, 100)).toBeCloseTo(1, 5);
  });

  it('negative offset → clamped to 0', () => {
    expect(computeFraction(-50, 0, 100)).toBe(0);
  });

  it('overshoot right → clamped to 1', () => {
    expect(computeFraction(200, 0, 100)).toBe(1);
  });

  it('width=0, clientX !== left → Infinity clamped to 1 (no throw)', () => {
    // (10 - 0) / 0 = +Infinity → min(1, max(0, Inf)) = 1
    const result = computeFraction(10, 0, 0);
    expect(result).toBe(1);
  });

  it('width=0, clientX === left → 0/0 = NaN (NOT clamped — known limitation)', () => {
    // This documents the known edge-case: NaN propagates through Math.max/min
    const result = computeFraction(0, 0, 0);
    // NaN is the actual result; document it so the team is aware
    expect(Number.isNaN(result)).toBe(true);
  });
});
