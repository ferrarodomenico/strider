import { inject, Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { API_BASE_URL, NDJSON_CONTENT_TYPE } from '@app/core/config/api.config';
import { StreamStatus } from '@app/core/models/view.types';
import { buildListUrl, ListQuery } from './api-url.util';

function extractBodyDetail(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const detail = parsed['error'] ?? parsed['message'];
    return typeof detail === 'string' ? detail.trim() : trimmed;
  } catch {
    return trimmed;
  }
}

function composeHttpError(status: number, statusText: string, bodyText: string): string {
  const label = statusText || `HTTP ${status}`;
  const detail = extractBodyDetail(bodyText);
  if (!detail || detail === label) return label;
  return `${label}: ${detail}`;
}

export interface StreamHandle<T> {
  rows: Signal<readonly T[]>;
  status: Signal<StreamStatus>;
  error: Signal<string | null>;
  cancel(): void;
}

@Injectable({ providedIn: 'root' })
export class NdjsonStreamService {
  private readonly baseUrl = inject(API_BASE_URL);

  stream<T>(path: string, query: ListQuery, mapLine: (raw: unknown) => T): StreamHandle<T> {
    const _rows: WritableSignal<readonly T[]> = signal<readonly T[]>([]);
    const _status = signal<StreamStatus>('streaming');
    const _error = signal<string | null>(null);

    const ctrl = new AbortController();

    this.fetchStream(path, query, mapLine, ctrl, _rows, _status, _error);

    return {
      rows: _rows.asReadonly(),
      status: _status.asReadonly(),
      error: _error.asReadonly(),
      cancel: () => {
        ctrl.abort();
        if (_status() === 'streaming') _status.set('done');
      },
    };
  }

  /**
   * Fetches a whole NDJSON list and resolves with every mapped row once the response
   * is complete. Rejects on a non-2xx status (same message format as stream()), on a
   * network error, or with an AbortError when signal is aborted.
   */
  async fetchAll<T>(
    path: string,
    query: ListQuery,
    mapLine: (raw: unknown) => T,
    signal: AbortSignal,
  ): Promise<T[]> {
    const res = await fetch(buildListUrl(this.baseUrl, path, query), {
      signal,
      headers: { Accept: NDJSON_CONTENT_TYPE },
    });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(composeHttpError(res.status, res.statusText, bodyText));

    return bodyText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => mapLine(JSON.parse(line)));
  }

  private async fetchStream<T>(
    path: string,
    query: ListQuery,
    mapLine: (raw: unknown) => T,
    ctrl: AbortController,
    _rows: WritableSignal<readonly T[]>,
    _status: WritableSignal<StreamStatus>,
    _error: WritableSignal<string | null>,
  ): Promise<void> {
    try {
      const res = await fetch(buildListUrl(this.baseUrl, path, query), {
        signal: ctrl.signal,
        headers: { Accept: NDJSON_CONTENT_TYPE },
      });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        _error.set(composeHttpError(res.status, res.statusText, bodyText));
        _status.set('error');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          const trailing = buf.trim();
          if (trailing.length > 0) {
            const item = mapLine(JSON.parse(trailing));
            _rows.update((prev) => [...prev, item]);
          }
          if (_status() === 'streaming') _status.set('done');
          break;
        }

        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        const batch: T[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          batch.push(mapLine(JSON.parse(trimmed)));
        }

        if (batch.length === 0) continue;

        _rows.update((prev) => [...prev, ...batch]);
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      _error.set(e instanceof Error ? e.message : String(e));
      _status.set('error');
    }
  }
}
