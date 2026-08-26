import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Dropdown, DropdownOption, Toggle } from '@hostelhive/ui';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { SessionStore } from '@core/auth';
import { ImageUploadService, UsersApi } from '@services';
import { GoogleAnalyticsService } from '@core/google-analytics/google-analytics.service';
import {
  googleAnalyticsConsent,
  setGoogleAnalyticsConsent,
} from '@core/google-analytics/google-analytics-consent';
import { googleAnalyticsEnv } from '@app/google-analytics.env';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { LOCALES, flagSrc } from '@core/i18n/locales';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { CurrencySelect } from '@app/shared/currency/currency-select';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, PhotoPicker, RouterLink, LocaleLink, Toggle, Dropdown, CurrencySelect, TranslocoPipe],
  templateUrl: './settings.html',
})
export class AccountSettings implements OnInit {
  private readonly session = inject(SessionStore);
  private readonly usersApi = inject(UsersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly analytics = inject(GoogleAnalyticsService);

  /**
   * Withdrawing consent has to be as easy as giving it (GDPR Art. 7(3)), and "clear your
   * localStorage" is not that. Hidden entirely when no measurement id is configured —
   * offering a switch that governs nothing would imply tracking that is not happening.
   */
  protected readonly analyticsConfigured = !!googleAnalyticsEnv.measurementId;
  protected readonly analyticsAllowed = computed(() => googleAnalyticsConsent() === 'granted');

  protected onAnalyticsToggle(allow: boolean): void {
    setGoogleAnalyticsConsent(allow ? 'granted' : 'denied');
    if (allow) this.analytics.start();
    else this.analytics.stop();
  }

  /* ---------------------------------------------------------- language & currency */

  private readonly locale = inject(LocaleStore);
  private readonly currencyPref = inject(CurrencyPreference);

  /**
   * Each language labelled in its own script, with the English name alongside — someone
   * escaping a language they cannot read is not helped by a list written only in it.
   */
  protected readonly localeOptions: DropdownOption[] = LOCALES.map((l) => ({
    value: l.code,
    label: l.name === l.englishName ? l.name : `${l.name} (${l.englishName})`,
    iconUrl: flagSrc(l),
  }));

  protected readonly activeLocale = this.locale.active;

  /**
   * Applied on pick rather than on Save.
   *
   * Changing the language navigates, which would throw away anything typed into the
   * profile fields above if it were deferred to the same Save button. Both controls here
   * are one-click choices that take effect immediately and say so, so there is nothing
   * half-finished for a Save to commit.
   */
  protected onLocalePick(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.locale.switchTo(v);
  }

  protected readonly currency = this.currencyPref.code;

  protected onCurrencyPick(code: string | null): void {
    if (code) this.currencyPref.set(code);
  }

  protected readonly user = this.session.user;
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly avatarUrl = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal(false);

  ngOnInit(): void {
    const u = this.user();
    if (!u) return;
    this.name.set(u.name);
    this.usersApi.getById(u.id).subscribe({
      next: (profile) => {
        this.phone.set(profile.phone ?? '');
        this.avatarUrl.set(profile.avatar?.url ?? null);
      },
      error: () => {},
    });
  }

  /**
   * Drag-drop / file / camera all funnel here via the shared picker.
   *
   * The upload only parks the file in S3 — until the user record points at it, the photo is
   * not the user's avatar anywhere but this screen. So it commits immediately instead of
   * waiting for Save: picking a photo already reads as having changed it, and a user who
   * uploaded and then navigated away was silently losing it.
   */
  protected onPickedAvatar(file: File): void {
    const previous = this.avatarUrl();
    this.uploading.set(true);
    this.imageUpload.upload('avatar', file).subscribe({
      next: (result) => {
        this.avatarUrl.set(result.url);
        // Spinner stays up through the PATCH, so it clears only once the avatar is really saved.
        this.persistAvatar(result.id, previous);
      },
      error: () => this.uploading.set(false),
    });
  }

  protected removeAvatar(): void {
    const previous = this.avatarUrl();
    this.avatarUrl.set(null);
    this.persistAvatar(null, previous);
  }

  /**
   * Commits the avatar on its own, outside the Save button.
   *
   * On failure the preview rolls back to `previous`, so what is on screen keeps matching what
   * the server actually holds rather than showing a photo that was never stored.
   */
  private persistAvatar(avatarId: string | null, previous: string | null): void {
    const u = this.user();
    if (!u) {
      this.uploading.set(false);
      return;
    }
    this.saveError.set(false);
    this.usersApi.update(u.id, { avatarId }).subscribe({
      next: () => {
        this.uploading.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
      },
      error: () => {
        this.uploading.set(false);
        this.avatarUrl.set(previous);
        this.saveError.set(true);
        setTimeout(() => this.saveError.set(false), 3000);
      },
    });
  }

  protected save(): void {
    const u = this.user();
    if (!u) return;
    this.saving.set(true);
    this.saveError.set(false);
    this.usersApi.update(u.id, { name: this.name(), phone: this.phone() }).subscribe({
      next: (updated) => {
        const token = this.session.accessToken();
        if (token) this.session.setSession({ ...u, name: updated.name }, token);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2000);
      },
      error: () => {
        this.saving.set(false);
        this.saveError.set(true);
        setTimeout(() => this.saveError.set(false), 3000);
      },
    });
  }
}
