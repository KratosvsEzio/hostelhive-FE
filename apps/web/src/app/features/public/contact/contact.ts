import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-contact',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, TranslocoPipe],
  templateUrl: './contact.html',
})
export class Contact {}
