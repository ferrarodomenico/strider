import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '@app/core/config/api.config';
import { mapTraceCountBuckets } from '@app/core/mappers/trace-count.mappers';
import { IntervalRangeQuery } from '@app/core/models/interval-range.model';
import { RawTraceCountBucket } from '@app/core/models/raw-dtos.model';
import { TraceCountBucket } from '@app/core/models/trace-count.model';
import { buildTraceCountUrl } from './api-url.util';

@Injectable({ providedIn: 'root' })
export class TraceCountClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  fetchTraceCounts(query: IntervalRangeQuery): Observable<TraceCountBucket[]> {
    const url = buildTraceCountUrl(this.baseUrl, query);
    return this.http.get<RawTraceCountBucket[] | null>(url).pipe(map(mapTraceCountBuckets));
  }
}
