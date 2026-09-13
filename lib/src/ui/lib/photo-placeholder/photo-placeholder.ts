import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * What a listing shows where its photographs would be, when it has none.
 *
 * This replaces a fallback that fetched a random photograph from `picsum.photos` and put it
 * in the gallery. It filled the space, which is the only thing it had going for it: a seeker
 * saw a real-looking picture of somewhere that is not the hostel, on a page whose whole job
 * is to tell them what the hostel looks like. On a marketplace where the photo is most of the
 * decision, an invented one is worse than an honest gap — and it also meant "this hostel has
 * no photos" was indistinguishable from "this hostel has photos" at a glance, for anyone
 * working the moderation queue.
 *
 * Fills its container, so the caller keeps owning the aspect ratio. Every place that shows
 * photographs already reserves the box.
 */
@Component({
  selector: 'hh-photo-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  host: { class: 'block h-full w-full' },
  template: `
    <div
      class="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-ink-50 text-ink-400"
      role="img"
      [attr.aria-label]="'common.noPhotosYet' | transloco"
    >
      <i class="ti ti-photo-off" [class]="compact() ? 'text-lg' : 'text-2xl'" aria-hidden="true"></i>
      <!-- The label is dropped on a small tile rather than shrunk: at card size it wrapped to
           two lines and pushed the icon off centre. The aria-label above carries the meaning
           either way, so nothing is lost to a screen reader. -->
      @if (!compact()) {
        <span class="text-xs font-medium">{{ 'common.noPhotosYet' | transloco }}</span>
      }
    </div>
  `,
})
export class PhotoPlaceholder {
  /** Icon only — for a card-sized tile, where the label does not fit on one line. */
  readonly compact = input(false);
}
