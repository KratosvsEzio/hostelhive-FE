import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ErrorState } from '@hostelhive/ui';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorState, TranslocoPipe],
  templateUrl: './forbidden.html',
})
export class Forbidden {}
