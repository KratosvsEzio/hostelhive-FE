import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Container } from '@hostelhive/ui';
import { HOST_ROLES, SessionStore } from '@core/auth';
import { LocaleLink } from '@core/i18n/locale-link';
import { Mascot } from '@app/shared/mascot/mascot';

/** "List your hostel and fill every bed": a dusk band with clouds and the bee holding up a key. */
@Component({
  selector: 'app-home-hosts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslocoPipe, Container, RouterLink, LocaleLink, Mascot],
  templateUrl: './home-hosts.html',
  styleUrl: './home-hosts.scss',
})
export class HomeHosts {
  private readonly session = inject(SessionStore);

  // Existing hosts (host/manager/warden) go straight to their dashboard; everyone
  // else starts the become-a-host onboarding wizard.
  private readonly isHost = computed(() => this.session.hasRole(...HOST_ROLES));
  protected readonly hostLink = computed(() => (this.isHost() ? '/host' : '/host/listings/new'));
  protected readonly hostCta = computed(() =>
    this.isHost() ? 'Go to your dashboard' : 'Start hosting',
  );

  protected readonly hostPerks = [
    { t: 'Thousands of verified seekers' },
    { t: 'Rooms, tenants & billing in one app' },
    { t: 'Insights that fill beds faster' },
  ];
}
