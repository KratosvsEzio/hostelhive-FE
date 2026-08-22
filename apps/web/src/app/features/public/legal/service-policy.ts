import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';

@Component({
  selector: 'app-service-policy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink],
  templateUrl: './service-policy.html',
})
export class ServicePolicy {}
