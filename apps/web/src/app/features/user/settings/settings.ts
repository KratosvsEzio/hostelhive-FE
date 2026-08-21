import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Toggle } from '@hostelhive/ui';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { SessionStore } from '@core/auth';
import { ImageUploadService, UsersApi } from '@services';
import { AnalyticsService } from '@core/analytics/analytics.service';
import {
  analyticsConsent,
  setAnalyticsConsent,
} from '@core/analytics/analytics-consent';
import { analyticsEnv } from '@app/analytics.env';

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, PhotoPicker, RouterLink, Toggle],
  templateUrl: './settings.html',
})
export class AccountSettings implements OnInit {
  private readonly session = inject(SessionStore);
  private readonly usersApi = inject(UsersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly analytics = inject(AnalyticsService);

  /**
   * Withdrawing consent has to be as easy as giving it (GDPR Art. 7(3)), and "clear your
   * localStorage" is not that. Hidden entirely when no measurement id is configured —
   * offering a switch that governs nothing would imply tracking that is not happening.
   */
  protected readonly analyticsConfigured = !!analyticsEnv.measurementId;
  protected readonly analyticsAllowed = computed(() => analyticsConsent() === 'granted');

  protected onAnalyticsToggle(allow: boolean): void {
    setAnalyticsConsent(allow ? 'granted' : 'denied');
    if (allow) this.analytics.start();
    else this.analytics.stop();
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
      next: (profile) => this.phone.set(profile.phone ?? ''),
      error: () => {},
    });
  }

  /** Drag-drop / file / camera all funnel here via the shared picker. */
  protected onPickedAvatar(file: File): void {
    this.uploading.set(true);
    this.imageUpload.upload('avatar', file).subscribe({
      next: (result) => { this.avatarUrl.set(result.url); this.uploading.set(false); },
      error: () => this.uploading.set(false),
    });
  }

  protected removeAvatar(): void { this.avatarUrl.set(null); }

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
