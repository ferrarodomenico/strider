import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL } from '@app/core/config/api.config';
import { RawTraceDetail } from '@app/core/models/raw-dtos.model';
import { TraceDetail } from '@app/core/models/trace-detail.model';
import { mapTraceDetail } from '@app/core/mappers/trace.mappers';
import { buildTraceDetailUrl } from './api-url.util';

@Injectable({ providedIn: 'root' })
export class TraceDetailClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  fetchTrace(id: string): Observable<TraceDetail> {
    const url = buildTraceDetailUrl(this.baseUrl, id);
    return this.http.get<RawTraceDetail>(url).pipe(map(mapTraceDetail));
  }
}
