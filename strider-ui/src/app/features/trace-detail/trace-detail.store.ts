import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TraceDetailClient } from '@app/core/http/trace-detail.client';
import { Span } from '@app/core/models/span.model';
import { SpanNode, TraceDetail, WaterfallRow } from '@app/core/models/trace-detail.model';
import { collectAncestorIds, findSpan, flattenForest } from '@app/core/util/waterfall.util';

@Injectable()
export class TraceDetailStore {
  private readonly client = inject(TraceDetailClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  readonly error = signal<string | null>(null);
  readonly trace = signal<TraceDetail | null>(null);
  readonly selectedSpanId = signal<string | null>(null);
  readonly collapsed = signal<ReadonlySet<string>>(new Set());

  readonly flatRows = computed<WaterfallRow[]>(() => {
    const t = this.trace();
    if (!t) return [];
    return flattenForest(t, this.collapsed());
  });

  readonly selectedSpan = computed<Span | null>(() => {
    const t = this.trace();
    const id = this.selectedSpanId();
    return t && id ? findSpan(t.roots, id) : null;
  });

  load(id: string): void {
    this.status.set('loading');
    this.error.set(null);
    this.trace.set(null);

    this.client
      .fetchTrace(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trace) => {
          this.trace.set(trace);
          this.status.set('loaded');
        },
        error: (err: unknown) => {
          const message = this.extractErrorMessage(err);
          this.error.set(message);
          this.status.set('error');
        },
      });
  }

  selectSpan(id: string): void {
    const t = this.trace();
    if (!t) return;

    if (this.selectedSpanId() === id) {
      this.selectedSpanId.set(null);
      return;
    }

    const ancestorIds = collectAncestorIds(t.roots as readonly SpanNode[], id);
    this.collapsed.update((prev) => {
      const next = new Set(prev);
      for (const ancestorId of ancestorIds) {
        next.delete(ancestorId);
      }
      return next;
    });

    this.selectedSpanId.set(id);
  }

  toggleCollapse(id: string): void {
    this.collapsed.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  private extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      const httpErr = err as {
        status: number;
        statusText?: string;
        error?: unknown;
        message?: string;
      };
      const label = httpErr.statusText || `HTTP ${httpErr.status}`;
      const detail = this.extractHttpBodyDetail(httpErr.error);
      if (!detail || detail === label) return label;
      return `${label}: ${detail}`;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private extractHttpBodyDetail(body: unknown): string {
    if (body == null) return '';
    if (typeof body === 'string') return body.trim();
    if (typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      const field = obj['error'] ?? obj['message'];
      return typeof field === 'string' ? field.trim() : '';
    }
    return '';
  }
}
