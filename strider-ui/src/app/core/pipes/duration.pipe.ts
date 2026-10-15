import { Pipe, PipeTransform } from '@angular/core';
import { formatDuration } from '@app/core/util/duration.util';

@Pipe({ name: 'duration', standalone: true, pure: true })
export class DurationPipe implements PipeTransform {
  transform(ns: number): string {
    return formatDuration(ns);
  }
}
