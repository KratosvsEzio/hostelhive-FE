import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** The part of a hero scene this layer draws: its photo and the photo's description (a key). */
export interface SkyScene {
  key: string;
  img: string;
  alt: string;
}

/**
 * The landing hero's backdrop: the scene photos, a dusk tint and the cloud layers. Purely
 * presentational — HeroClouds owns the timeline and animates these elements directly, so the
 * classes are shared and `hc-` prefixed rather than encapsulated.
 */
@Component({
  selector: 'app-hero-sky',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslocoPipe],
  templateUrl: './hero-sky.html',
  styleUrl: './hero-sky.scss',
})
export class HeroSky {
  readonly scenes = input.required<SkyScene[]>();
}
