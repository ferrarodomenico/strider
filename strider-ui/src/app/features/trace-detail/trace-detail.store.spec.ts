/**
 * Tests for FIX #2 – extractErrorMessage in TraceDetailStore.
 *
 * We test the private method behaviour by feeding HttpErrorResponse-shaped
 * objects through store.load() with a mocked TraceDetailClient that throws.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, DestroyRef } from '@angular/core';
import { of, throwError } from 'rxjs';
import { TraceDetailStore } from './trace-detail.store';
import { TraceDetailClient } from '@app/core/http/trace-detail.client';

function makeClient(error?: unknown) {
  return {
    fetchTrace: error
      ? () => throwError(() => error)
      : () => of({ roots: [], traceId: 'abc', totalDurationNs: 0 }),
  } as unknown as TraceDetailClient;
}

function fakeDestroyRef(): DestroyRef {
  // Minimal DestroyRef that never destroys during the test
  return {
    onDestroy: () => () => {},
  } as unknown as DestroyRef;
}

function createStore(error?: unknown): TraceDetailStore {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      TraceDetailStore,
      { provide: TraceDetailClient, useValue: makeClient(error) },
      { provide: DestroyRef, useValue: fakeDestroyRef() },
    ],
  });
  return TestBed.inject(TraceDetailStore);
}

describe('TraceDetailStore – extractErrorMessage (FIX #2)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // --- HttpErrorResponse with JSON .error field ---
  it('composes "<statusText>: <error>" from HttpErrorResponse with object .error.error', () => {
    const httpErr = { status: 500, statusText: 'Internal Server Error', error: { error: 'db timeout' } };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('Internal Server Error: db timeout');
  });

  // --- HttpErrorResponse with JSON .message field ---
  it('composes "<statusText>: <message>" from HttpErrorResponse with object .error.message', () => {
    const httpErr = { status: 503, statusText: 'Service Unavailable', error: { message: 'try later' } };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('Service Unavailable: try later');
  });

  // --- HttpErrorResponse with string body ---
  it('uses string .error as detail when it differs from statusText', () => {
    const httpErr = { status: 404, statusText: 'Not Found', error: 'trace not found' };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('Not Found: trace not found');
  });

  // --- detail equals statusText → no duplication ---
  it('shows only statusText when string .error equals statusText', () => {
    const httpErr = { status: 404, statusText: 'Not Found', error: 'Not Found' };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.error()).toBe('Not Found');
    expect(store.error()).not.toContain('Not Found: Not Found');
  });

  // --- Empty / null body ---
  it('shows only statusText when error body is null', () => {
    const httpErr = { status: 500, statusText: 'Internal Server Error', error: null };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.error()).toBe('Internal Server Error');
  });

  // --- Missing statusText → "HTTP <status>" ---
  it('falls back to "HTTP <status>" when statusText is absent', () => {
    const httpErr = { status: 418, statusText: '', error: { error: 'teapot' } };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.error()).toBe('HTTP 418: teapot');
  });

  // --- Non-HTTP error (plain Error instance) ---
  it('uses err.message for plain Error objects', () => {
    const store = createStore(new Error('network failure'));
    store.load('trace-1');
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('network failure');
  });

  // --- Successful load path ---
  it('sets status to "loaded" on success', () => {
    const store = createStore();
    store.load('trace-1');
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
  });

  // --- HttpErrorResponse with object body missing both error and message fields ---
  it('shows only statusText when object body has no error or message fields', () => {
    const httpErr = { status: 500, statusText: 'Internal Server Error', error: { code: 42 } };
    const store = createStore(httpErr);
    store.load('trace-1');
    expect(store.error()).toBe('Internal Server Error');
  });
});
