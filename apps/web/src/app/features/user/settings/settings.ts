import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, signal } from '@angular/core';
import { Button } from '@hostelhive/ui';

@Component({
  selector: 'app-account-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  templateUrl: './settings.html',
})
export class AccountSettings {
  @ViewChild('cameraInput') private cameraInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  protected readonly avatarUrl = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected openCamera(): void {
    this.cameraInput.nativeElement.click();
  }

  protected openFilePicker(): void {
    this.fileInput.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.avatarUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  protected removeAvatar(): void {
    this.avatarUrl.set(null);
  }

  protected save(): void {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
