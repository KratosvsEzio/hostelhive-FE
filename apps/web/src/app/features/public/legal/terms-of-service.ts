import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';

@Component({
  selector: 'app-terms-of-service',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, TranslocoPipe],
  templateUrl: './terms-of-service.html',
})
export class TermsOfService {}
