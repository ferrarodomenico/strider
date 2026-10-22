import { inject, Injectable } from '@angular/core';
import { API_BASE_URL, API_PATHS } from '@app/core/config/api.config';

export interface LiveConnection {
  close(): void;
}

/**
 * Server-sent events from GET /live-updates. The backend sends one event every time
 * fresh spans are saved; the payload carries no data, it is only a signal.
 */
@Injectable({ providedIn: 'root' })
export class LiveUpdatesClient {
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * Opens the SSE connection and calls onSignal for every event. EventSource reconnects
   * on its own after a network error. The connection is closed by close() or when the
   * page is unloaded (pagehide), whichever comes first.
   */
  connect(onSignal: () => void): LiveConnection {
    const source = new EventSource(`${this.baseUrl}${API_PATHS.liveUpdates}`);
    source.onmessage = () => onSignal();

    const close = () => {
      source.close();
      window.removeEventListener('pagehide', close);
    };
    window.addEventListener('pagehide', close);

    return { close };
  }
}
