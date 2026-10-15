/**
 * Component-level verification tests for the three fixes.
 *
 * Covers all acceptance criteria that are verifiable in the Angular jsdom
 * test environment. CSS/SCSS source content (FIX #1 flex chain, FIX #3
 * token values) cannot be verified here — those were verified by source
 * review and are marked MANUAL-CHECK in the QA report.
 *
 * FIX #2 – Error message display (ndjson-stream-error.spec.ts, trace-detail.store.spec.ts)
 * FIX #3 – Header SVG logo (this file)
 * XSS    – No innerHTML usage (this file via component rendering)
 */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AppHeader } from './shared/layout/app-header';
import { StateMessage } from './shared/ui/state-message';

// ---------------------------------------------------------------------------
// FIX #3 – AppHeader: SVG logo exists, is aria-hidden, precedes wordmark
// ---------------------------------------------------------------------------
describe('FIX #3 – AppHeader SVG logo (component test)', () => {
  let fixture: ComponentFixture<AppHeader>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppHeader],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  it('renders an svg.logo element', () => {
    expect(el.querySelector('svg.logo')).toBeTruthy();
  });

  it('SVG has aria-hidden="true"', () => {
    const svg = el.querySelector('svg.logo');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('SVG precedes .wordmark in DOM order (logo LEFT of wordmark)', () => {
    const svg = el.querySelector('svg.logo') as Element;
    const wordmark = el.querySelector('.wordmark') as Element;
    expect(svg).toBeTruthy();
    expect(wordmark).toBeTruthy();
    // Node.DOCUMENT_POSITION_FOLLOWING means svg comes before wordmark
    const pos = svg.compareDocumentPosition(wordmark);
    // eslint-disable-next-line no-bitwise
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('.header element exists', () => {
    expect(el.querySelector('.header')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FIX #3 – App root: no bg-gradient or bg-grid divs in DOM
// ---------------------------------------------------------------------------
describe('FIX #3 – App root: bg-gradient/bg-grid divs removed', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('app root does NOT contain a .bg-gradient element', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.bg-gradient')).toBeNull();
  });

  it('app root does NOT contain a .bg-grid element', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.bg-grid')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// XSS Safety – state-message renders text via text node, not innerHTML
// ---------------------------------------------------------------------------
describe('XSS Safety – StateMessage renders error via text node', () => {
  let fixture: ComponentFixture<StateMessage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StateMessage],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(StateMessage);
    fixture.componentRef.setInput('variant', 'error');
    fixture.componentRef.setInput('message', '<img src=x onerror=alert(1)>');
    await fixture.whenStable();
  });

  it('renders the message as literal text, not parsed HTML', () => {
    const el = fixture.nativeElement as HTMLElement;
    // The XSS payload must appear as text, not as an <img> element
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('does not create DOM elements from the error message', () => {
    const el = fixture.nativeElement as HTMLElement;
    const label = el.querySelector('.label') as HTMLElement;
    // .label should contain only a text node, not child elements
    expect(label.children.length).toBe(0);
  });
});
