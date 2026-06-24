import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="mt-16 border-t border-ink-100 bg-white">
      <div class="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <img src="/hostelhive-logo.png" alt="HostelHive" class="h-6 w-auto" />
        <p class="text-xs text-ink-400">© 2026 HostelHive · Verified hostels across Pakistan</p>
        <nav class="flex gap-4 text-sm text-ink-500">
          <a href="#" class="hover:text-ink-800">About</a>
          <a href="#" class="hover:text-ink-800">Help</a>
          <a href="#" class="hover:text-ink-800">Privacy</a>
        </nav>
      </div>
    </footer>
  `,
})
export class SiteFooter {}
