import { Pipe, PipeTransform } from '@angular/core';
import { spanKindLabel } from '@app/core/config/otel.constants';

@Pipe({ name: 'spanKind', standalone: true, pure: true })
export class SpanKindPipe implements PipeTransform {
  transform(k: number): string {
    return spanKindLabel(k);
  }
}
