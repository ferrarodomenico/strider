interface HttpErrorLike {
  status: number;
  statusText?: string;
  error?: unknown;
}

// Same composition as TraceDetailStore.extractErrorMessage; kept as a separate copy so
// existing stores stay untouched (consolidation is a follow-up).
export function describeHttpError(err: unknown): string {
  if (err && typeof err === 'object' && 'status' in err) {
    const httpErr = err as HttpErrorLike;
    const label = httpErr.statusText || `HTTP ${httpErr.status}`;
    const detail = httpBodyDetail(httpErr.error);
    if (!detail || detail === label) return label;
    return `${label}: ${detail}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function httpBodyDetail(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body.trim();
  if (typeof body === 'object') {
    const fields = body as Record<string, unknown>;
    const field = fields['error'] ?? fields['message'];
    return typeof field === 'string' ? field.trim() : '';
  }
  return '';
}
