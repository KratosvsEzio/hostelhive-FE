import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'hh-subscription-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white transition-opacity duration-300"
      [class.opacity-0]="leaving()"
    >
      <img src="/hostelhive-logo.png" alt="HostelHive" class="h-7" />

      <div class="mt-8 h-0.5 w-40 overflow-hidden rounded-full bg-ink-100">
        <div class="progress-bar h-full w-2/5 rounded-full bg-brand-500"></div>
      </div>

      <p class="mt-5 text-sm text-ink-400">Loading your dashboard…</p>
    </div>
  `,
  styles: [`
    @keyframes slide {
      0% { transform: translateX(-250%); }
      100% { transform: translateX(400%); }
    }
    .progress-bar {
      animation: slide 1.2s ease-in-out infinite;
    }
  `],
})
export class SubscriptionLoading {
  readonly leaving = input(false);
}
