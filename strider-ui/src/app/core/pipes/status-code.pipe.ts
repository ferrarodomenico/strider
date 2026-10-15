import { Pipe, PipeTransform } from '@angular/core';
import { statusCodeLabel } from '@app/core/config/otel.constants';

@Pipe({ name: 'statusCode', standalone: true, pure: true })
export class StatusCodePipe implements PipeTransform {
  transform(c: number): string {
    return statusCodeLabel(c);
  }
}
