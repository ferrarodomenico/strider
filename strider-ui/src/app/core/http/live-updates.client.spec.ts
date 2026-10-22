import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { API_BASE_URL } from '@app/core/config/api.config';
import { LiveUpdatesClient } from './live-updates.client';

/** Minimal EventSource stand-in: jsdom does not implement it. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emit(): void {
    this.onmessage?.(new MessageEvent('message', { data: 'new spans available' }));
  }
}

describe('LiveUpdatesClient', () => {
  let client: LiveUpdatesClient;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LiveUpdatesClient,
        { provide: API_BASE_URL, useValue: 'http://api' },
      ],
    });
    client = TestBed.inject(LiveUpdatesClient);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects to /live-updates under the API base URL', () => {
    client.connect(() => {});
    expect(FakeEventSource.instances[0].url).toBe('http://api/live-updates');
  });

  it('calls onSignal for every event', () => {
    const onSignal = vi.fn();
    client.connect(onSignal);
    FakeEventSource.instances[0].emit();
    FakeEventSource.instances[0].emit();
    expect(onSignal).toHaveBeenCalledTimes(2);
  });

  it('close() closes the event source', () => {
    client.connect(() => {}).close();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('closes the event source when the page is unloaded', () => {
    client.connect(() => {});
    window.dispatchEvent(new Event('pagehide'));
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('stops listening for pagehide once closed', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    client.connect(() => {}).close();
    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    removeSpy.mockRestore();
  });
});
