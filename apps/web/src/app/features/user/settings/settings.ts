import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Button } from '@hostelhive/ui';
import { SessionStore } from '@core/auth';
import { ImageUploadService, UsersApi } from '@services';

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './settings.html',
})
export class AccountSettings implements OnInit {
  @ViewChild('cameraInput') private cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  private readonly session = inject(SessionStore);
  private readonly usersApi = inject(UsersApi);
  private readonly imageUpload = inject(ImageUploadService);

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

  protected initials(): string {
    const n = this.user()?.name?.trim() ?? '';
    return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  protected openCamera(): void { this.cameraInput.nativeElement.click(); }
  protected openFilePicker(): void { this.fileInput.nativeElement.click(); }

  protected onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    (event.target as HTMLInputElement).value = '';
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
