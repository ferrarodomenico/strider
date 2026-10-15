import { inject, Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { API_BASE_URL, NDJSON_CONTENT_TYPE, STREAM_ROW_CAP } from '@app/core/config/api.config';
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
  capReached: Signal<boolean>;
  cancel(): void;
}

@Injectable({ providedIn: 'root' })
export class NdjsonStreamService {
  private readonly baseUrl = inject(API_BASE_URL);

  stream<T>(path: string, query: ListQuery, mapLine: (raw: unknown) => T): StreamHandle<T> {
    const _rows: WritableSignal<readonly T[]> = signal<readonly T[]>([]);
    const _status = signal<StreamStatus>('streaming');
    const _error = signal<string | null>(null);
    const _cap = signal(false);

    const ctrl = new AbortController();

    this.fetchStream(path, query, mapLine, ctrl, _rows, _status, _error, _cap);

    return {
      rows: _rows.asReadonly(),
      status: _status.asReadonly(),
      error: _error.asReadonly(),
      capReached: _cap.asReadonly(),
      cancel: () => {
        ctrl.abort();
        if (_status() === 'streaming') _status.set('done');
      },
    };
  }

  private async fetchStream<T>(
    path: string,
    query: ListQuery,
    mapLine: (raw: unknown) => T,
    ctrl: AbortController,
    _rows: WritableSignal<readonly T[]>,
    _status: WritableSignal<StreamStatus>,
    _error: WritableSignal<string | null>,
    _cap: WritableSignal<boolean>,
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
            this.appendParsedLine(trailing, mapLine, _rows, _status, _cap, ctrl);
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

        _rows.update((prev) => {
          const remaining = STREAM_ROW_CAP - prev.length;
          if (remaining <= 0) return prev;
          if (batch.length >= remaining) {
            _cap.set(true);
            _status.set('done');
            ctrl.abort();
            return [...prev, ...batch.slice(0, remaining)];
          }
          return [...prev, ...batch];
        });

        if (_cap()) break;
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      _error.set(e instanceof Error ? e.message : String(e));
      _status.set('error');
    }
  }

  private appendParsedLine<T>(
    line: string,
    mapLine: (raw: unknown) => T,
    _rows: WritableSignal<readonly T[]>,
    _status: WritableSignal<StreamStatus>,
    _cap: WritableSignal<boolean>,
    ctrl: AbortController,
  ): void {
    const item = mapLine(JSON.parse(line));
    _rows.update((prev) => {
      if (prev.length >= STREAM_ROW_CAP) {
        _cap.set(true);
        _status.set('done');
        ctrl.abort();
        return prev;
      }
      return [...prev, item];
    });
  }
}
