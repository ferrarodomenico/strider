import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'localDateTime', standalone: true, pure: true })
export class LocalDateTimePipe implements PipeTransform {
  transform(s: string): string {
    return new Date(s).toLocaleString();
  }
}
