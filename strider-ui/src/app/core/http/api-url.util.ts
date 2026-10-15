import { API_PATHS } from '@app/core/config/api.config';
import { Direction, OrderByField } from '@app/core/models/view.types';

export interface ListQuery {
  orderBy: OrderByField;
  direction: Direction;
  condition: string;
}

export function buildListUrl(baseUrl: string, path: string, q: ListQuery): string {
  const params = new URLSearchParams();
  params.set('orderBy', q.orderBy);
  params.set('direction', q.direction);
  if (q.condition.trim().length > 0) params.set('condition', q.condition);
  return `${baseUrl}${path}?${params.toString()}`;
}

export const buildTraceDetailUrl = (baseUrl: string, id: string): string =>
  `${baseUrl}${API_PATHS.traceDetail(id)}`;
