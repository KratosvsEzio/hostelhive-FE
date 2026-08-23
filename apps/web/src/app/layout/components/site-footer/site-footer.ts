import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';
import { LanguageSwitcher } from '@core/i18n/language-switcher';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { CurrencySelect } from '@app/shared/currency/currency-select';
import { Container } from '@hostelhive/ui';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Container,
    TranslocoPipe,
    RouterLink,
    LocaleLink,
    LanguageSwitcher,
    CurrencySelect,
  ],
  templateUrl: './site-footer.html',
})
export class SiteFooter {
  private readonly currencyPref = inject(CurrencyPreference);

  /** Bound rather than copied, so picking in the header updates this control too. */
  protected readonly currency = this.currencyPref.code;

  /**
   * Defaults to `'user'`, which is the point of offering the control at all: choosing here
   * is the visitor deciding, so the location guess stands down from the next load on.
   */
  protected onCurrencyPick(code: string | null): void {
    if (code) this.currencyPref.set(code);
  }
}
