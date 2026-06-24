import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ErrorState } from '@hostelhive/ui';

@Component({
  selector: 'app-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorState],
  templateUrl: './forbidden.html',
})
export class Forbidden {}
