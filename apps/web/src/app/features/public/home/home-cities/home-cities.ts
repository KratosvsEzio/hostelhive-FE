import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Container, Skeleton } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';

export interface HomeCity {
  name: string;
  slug: string;
  img: string;
}

/** "Explore the hive, city by city": each city a small lit globe over faint orbits. */
@Component({
  selector: 'app-home-cities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslocoPipe, Container, RouterLink, LocaleLink, Skeleton],
  templateUrl: './home-cities.html',
  styleUrl: './home-cities.scss',
})
export class HomeCities {
  readonly cities = input.required<HomeCity[]>();
  /** Shows placeholder globes while the page is still finding out which cities to show. */
  readonly loading = input(false);

  protected readonly placeholders = [1, 2, 3, 4, 5];
}
