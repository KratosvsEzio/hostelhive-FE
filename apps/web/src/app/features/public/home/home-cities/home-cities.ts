import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Container, Skeleton } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';

/** A city on the home page: a globe in the cities section, and a chip under the closing search. */
export interface HomeCity {
  name: string;
  slug: string;
  /** The photograph on its globe, or null for a plain brand globe carrying {@link initial}. */
  img: string | null;
  /** The first letter of the name, for a globe without a photograph. */
  initial: string;
  path: string;
  query: Params | null;
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
  /** The visitor's country, in the language being read; named in the subtitle. */
  readonly countryName = input('');
  /** Shows placeholder globes while the page is still finding out which cities to show. */
  readonly loading = input(false);
  /** Whether the cities came from GeoNames, whose licence asks for the credit line. */
  readonly creditGeoNames = input(false);

  protected readonly placeholders = [1, 2, 3, 4, 5];
}
