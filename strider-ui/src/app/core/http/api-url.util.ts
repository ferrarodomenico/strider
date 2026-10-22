import { API_PATHS } from '@app/core/config/api.config';
import { IntervalRangeQuery } from '@app/core/models/interval-range.model';
import { Direction, OrderByField } from '@app/core/models/view.types';

export interface ListQuery {
  orderBy: OrderByField;
  direction: Direction;
  condition: string;
  /** `null` means no limit. Regular loads pass a ResultLimit; live updates pass the remaining capacity. */
  limit: number | null;
}

export function buildListUrl(baseUrl: string, path: string, q: ListQuery): string {
  const params = new URLSearchParams();
  params.set('orderBy', q.orderBy);
  params.set('direction', q.direction);
  if (q.condition.trim().length > 0) params.set('condition', q.condition);
  if (q.limit !== null) params.set('limit', String(q.limit));
  return `${baseUrl}${path}?${params.toString()}`;
}

export const buildTraceDetailUrl = (baseUrl: string, id: string): string =>
  `${baseUrl}${API_PATHS.traceDetail(id)}`;

export function buildTraceCountUrl(baseUrl: string, q: IntervalRangeQuery): string {
  const params = new URLSearchParams();
  params.set('interval', q.interval);
  if (q.start !== null) params.set('start', q.start);
  if (q.end !== null) params.set('end', q.end);
  return `${baseUrl}${API_PATHS.traceCount}?${params.toString()}`;
}
