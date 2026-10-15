/**
 * QA tests for TraceDetailStore.selectSpan toggle behavior (AC4).
 *
 * Acceptance criterion 4: clicking the currently-selected span deselects it
 * (selectedSpanId → null); clicking a different span selects it and keeps
 * ancestor-expand logic intact; selectedSpan computed returns null when
 * deselected.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, DestroyRef } from '@angular/core';
import { of } from 'rxjs';
import { TraceDetailStore } from './trace-detail.store';
import { TraceDetailClient } from '@app/core/http/trace-detail.client';
import { Span } from '@app/core/models/span.model';
import { SpanNode, TraceDetail } from '@app/core/models/trace-detail.model';

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

function makeNode(span: Span, subSpans: SpanNode[] = []): SpanNode {
  return { span, subSpans };
}

function makeTrace(roots: SpanNode[]): TraceDetail {
  return {
    traceId: 'trace1',
    rootName: 'root',
    serviceName: 'svc',
    startTime: '2024-01-01T00:00:00.000Z',
    durationNs: 2_000_000_000,
    roots,
  };
}

function fakeDestroyRef(): DestroyRef {
  return { onDestroy: () => () => {} } as unknown as DestroyRef;
}

function createStore(trace: TraceDetail): TraceDetailStore {
  const client = {
    fetchTrace: () => of(trace),
  } as unknown as TraceDetailClient;

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      TraceDetailStore,
      { provide: TraceDetailClient, useValue: client },
      { provide: DestroyRef, useValue: fakeDestroyRef() },
    ],
  });

  const store = TestBed.inject(TraceDetailStore);
  store.load('trace1');
  return store;
}

// ---------------------------------------------------------------------------
// Simple flat trace fixture: root with one child
// ---------------------------------------------------------------------------
const spanRoot = makeSpan({ spanId: 'root', parentSpanId: '' });
const spanChild = makeSpan({ spanId: 'child', parentSpanId: 'root' });
const flatTrace = makeTrace([makeNode(spanRoot, [makeNode(spanChild)])]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceDetailStore.selectSpan – toggle behavior (AC4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // AC4: clicking the same span a second time deselects it
  it('deselects the span when selectSpan is called with the already-selected id', () => {
    const store = createStore(flatTrace);
    store.selectSpan('child');
    expect(store.selectedSpanId()).toBe('child');

    // Toggle off
    store.selectSpan('child');
    expect(store.selectedSpanId()).toBeNull();
  });

  // AC4: selectedSpan computed returns null after deselect
  it('selectedSpan computed returns null after toggling off', () => {
    const store = createStore(flatTrace);
    store.selectSpan('child');
    expect(store.selectedSpan()).not.toBeNull();

    store.selectSpan('child');
    expect(store.selectedSpan()).toBeNull();
  });

  // AC4: clicking a different span selects the new one (no double-toggle)
  it('selects a different span when a new id is passed', () => {
    const store = createStore(flatTrace);
    store.selectSpan('root');
    expect(store.selectedSpanId()).toBe('root');

    store.selectSpan('child');
    expect(store.selectedSpanId()).toBe('child');
  });

  // selectedSpan computed reflects the actual span object when selected
  it('selectedSpan returns the matching Span object when a span is selected', () => {
    const store = createStore(flatTrace);
    store.selectSpan('child');
    expect(store.selectedSpan()?.spanId).toBe('child');
  });

  // Initial state: nothing selected, selectedSpanId is null, selectedSpan is null
  it('starts with selectedSpanId null and selectedSpan null', () => {
    const store = createStore(flatTrace);
    expect(store.selectedSpanId()).toBeNull();
    expect(store.selectedSpan()).toBeNull();
  });

  // Toggle off → toggle on again: works correctly
  it('can re-select the same span after it was deselected', () => {
    const store = createStore(flatTrace);
    store.selectSpan('child');
    store.selectSpan('child'); // deselect
    store.selectSpan('child'); // re-select
    expect(store.selectedSpanId()).toBe('child');
    expect(store.selectedSpan()?.spanId).toBe('child');
  });

  // Ancestor expand still works when selecting (not toggling)
  it('expands collapsed ancestors when selecting a span that is not already selected', () => {
    const store = createStore(flatTrace);
    // Manually collapse the root ancestor
    store.toggleCollapse('root');
    expect(store.collapsed().has('root')).toBe(true);

    // Selecting 'child' (whose ancestor is 'root') should expand root
    store.selectSpan('child');
    expect(store.collapsed().has('root')).toBe(false);
    expect(store.selectedSpanId()).toBe('child');
  });

  // Toggle off does NOT expand ancestors (deselect path returns early)
  it('does not modify collapsed set when toggling off (deselect path)', () => {
    const store = createStore(flatTrace);
    // Select child (expands root)
    store.selectSpan('child');
    // Collapse root again
    store.toggleCollapse('root');
    expect(store.collapsed().has('root')).toBe(true);

    // Toggle off child — should NOT touch collapsed
    store.selectSpan('child');
    expect(store.selectedSpanId()).toBeNull();
    // collapsed set should still have root (deselect returned early)
    expect(store.collapsed().has('root')).toBe(true);
  });

  // selectSpan with no loaded trace is a no-op
  it('is a no-op when trace is not loaded', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TraceDetailStore,
        {
          provide: TraceDetailClient,
          useValue: { fetchTrace: () => of(flatTrace) } as unknown as TraceDetailClient,
        },
        { provide: DestroyRef, useValue: fakeDestroyRef() },
      ],
    });
    const store = TestBed.inject(TraceDetailStore);
    // Do NOT call store.load — trace signal is null
    store.selectSpan('child');
    expect(store.selectedSpanId()).toBeNull();
  });
});
