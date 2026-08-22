import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';
import { Container } from '@hostelhive/ui';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Container, TranslocoPipe, RouterLink, LocaleLink],
  templateUrl: './site-footer.html',
})
export class SiteFooter {}
