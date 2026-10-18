import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { SavedCard as SavedCardModel } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { SavedCard, type SavedCardAction, cardExpiry } from './saved-card';

// Only the keys that take a parameter carry copy, so the spec can see what was passed in.
const COPY = {
  hostBilling: {
    cardExpires: 'Expires {{date}}',
  },
};

const VISA: SavedCardModel = {
  label: 'Visa •••• 4242',
  expires_on: '2028-04-30',
};

@Component({
  imports: [SavedCard],
  template: `
    <hh-saved-card
      [card]="card"
      [autoRenew]="autoRenew"
      [showAutoRenew]="showAutoRenew"
      [autoRenewBlocked]="autoRenewBlocked"
      [canManage]="canManage"
      [busy]="busy"
      [locked]="locked"
      (saveCard)="emitted.push('save')"
      (removeCard)="emitted.push('remove')"
      (autoRenewChange)="emitted.push($event)"
    >
      <span data-test="projected">error</span>
    </hh-saved-card>
  `,
})
class Host {
  card: SavedCardModel | null = VISA;
  autoRenew = false;
  showAutoRenew = true;
  autoRenewBlocked = false;
  canManage = true;
  busy: SavedCardAction | null = null;
  locked = false;
  emitted: (string | boolean)[] = [];
}

type Inputs = Partial<Omit<Host, 'emitted'>>;

describe('cardExpiry', () => {
  // Midday local time, so no offset moves "today" to another calendar day.
  const TODAY = new Date(2026, 9, 18, 12, 0, 0);

  it('is null without an expiry date', () => {
    expect(cardExpiry(null, TODAY)).toBeNull();
  });

  it('is expired once the expiry date has passed', () => {
    expect(cardExpiry('2026-10-17', TODAY)).toBe('expired');
    expect(cardExpiry('2025-01-31', TODAY)).toBe('expired');
  });

  it('is expiring, not expired, on the expiry date itself', () => {
    expect(cardExpiry('2026-10-18', TODAY)).toBe('expiring');
  });

  it('warns 29 and 30 days out, and not 31', () => {
    expect(cardExpiry('2026-11-16', TODAY)).toBe('expiring');
    expect(cardExpiry('2026-11-17', TODAY)).toBe('expiring');
    expect(cardExpiry('2026-11-18', TODAY)).toBeNull();
  });

  it('counts the window across a month and year end', () => {
    const dec = new Date(2026, 11, 15, 12, 0, 0);
    expect(cardExpiry('2027-01-14', dec)).toBe('expiring');
    expect(cardExpiry('2027-01-15', dec)).toBeNull();
  });

  it('reads only the date part of a timestamp', () => {
    expect(cardExpiry('2026-10-17T23:59:59.000+05:00', TODAY)).toBe('expired');
  });
});

describe('SavedCard', () => {
  let fixture: ComponentFixture<Host>;

  function render(inputs: Inputs = {}): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    TestBed.inject(TranslocoService).setTranslation(COPY, 'en');
    fixture = TestBed.createComponent(Host);
    Object.assign(fixture.componentInstance, inputs);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function update(inputs: Inputs): void {
    Object.assign(fixture.componentInstance, inputs);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  const byTestId = (el: HTMLElement, id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const field = (el: HTMLElement, name: string) =>
    el.querySelector(`[data-field="${name}"]`)?.textContent?.trim() ?? null;
  const switchOf = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[role="switch"]');
  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ') ?? '';

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('with a card', () => {
    it('shows the label as returned, kept together for RTL, and the expiry as MM/yy', () => {
      const el = render();

      expect(
        el.querySelector('[data-field="label"] bdi')?.textContent?.trim(),
      ).toBe('Visa •••• 4242');
      expect(field(el, 'expiry')).toBe('Expires 04/28');
      expect(text(el)).toContain('hostBilling.savedCardTitle');
      expect(el.querySelector('[data-field="no-card"]')).toBeNull();
    });

    it('leaves the expiry out when Safepay gave none', () => {
      const el = render({ card: { label: 'Card', expires_on: null } });

      expect(el.querySelector('[data-field="expiry"]')).toBeNull();
      expect(el.querySelector('[data-field="expiry-warning"]')).toBeNull();
    });

    it('offers Replace card and Remove card', () => {
      const el = render();

      expect(byTestId(el, 'card-save')?.textContent?.trim()).toBe(
        'hostBilling.replaceCard',
      );
      expect(byTestId(el, 'card-remove')?.textContent?.trim()).toBe(
        'hostBilling.removeCard',
      );
    });

    it('emits save and remove from its buttons', () => {
      const el = render();

      byTestId(el, 'card-save')?.click();
      byTestId(el, 'card-remove')?.click();

      expect(fixture.componentInstance.emitted).toEqual(['save', 'remove']);
    });
  });

  describe('expiry warning', () => {
    function renderOn(expiresOn: string): HTMLElement {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 18, 12, 0, 0));
      return render({ card: { label: 'Visa', expires_on: expiresOn } });
    }

    const warning = (el: HTMLElement) =>
      el.querySelector('[data-field="expiry-warning"]');

    it('warns that the card expires soon 29 days out, in the warn tone', () => {
      const el = renderOn('2026-11-16');

      expect(warning(el)?.textContent?.trim()).toBe(
        'hostBilling.cardExpiringSoon',
      );
      expect(warning(el)?.className).toContain('text-warn');
    });

    it('still warns 30 days out', () => {
      const el = renderOn('2026-11-17');

      expect(warning(el)?.textContent?.trim()).toBe(
        'hostBilling.cardExpiringSoon',
      );
    });

    it('does not warn 31 days out', () => {
      const el = renderOn('2026-11-18');

      expect(warning(el)).toBeNull();
    });

    it('says expired once the date has passed, in the danger tone', () => {
      const el = renderOn('2026-10-17');

      expect(warning(el)?.textContent?.trim()).toBe('hostBilling.cardExpired');
      expect(warning(el)?.className).toContain('text-danger');
    });
  });

  describe('without a card', () => {
    it('says no card is saved, with the hint and Save a card', () => {
      const el = render({ card: null });

      expect(field(el, 'no-card')).toBe('hostBilling.noCardSaved');
      expect(text(el)).toContain('hostBilling.noCardHint');
      expect(byTestId(el, 'card-save')?.textContent?.trim()).toBe(
        'hostBilling.saveCard',
      );
      expect(byTestId(el, 'card-remove')).toBeNull();
    });

    it('offers no switch, since renewal needs a card to charge', () => {
      const el = render({ card: null, showAutoRenew: true });

      expect(switchOf(el)).toBeNull();
    });
  });

  describe('auto-renew switch', () => {
    it('shows the value it is given, labelled and described by its hint', () => {
      const el = render({ autoRenew: true });
      const sw = switchOf(el);

      expect(sw?.getAttribute('aria-checked')).toBe('true');
      expect(sw?.disabled).toBe(false);
      expect(sw?.closest('label')?.textContent).toContain(
        'hostBilling.autoRenew',
      );
      const hintId = sw?.getAttribute('aria-describedby');
      expect(hintId).toBeTruthy();
      expect(el.querySelector(`#${hintId}`)?.textContent?.trim()).toBe(
        'hostBilling.autoRenewHint',
      );
    });

    it('says renewal invoices are paid by hand while it is off', () => {
      const el = render({ autoRenew: false });

      expect(field(el, 'auto-renew-hint')).toBe('hostBilling.autoRenewOffHint');

      update({ autoRenew: true });

      expect(field(el, 'auto-renew-hint')).toBe('hostBilling.autoRenewHint');
    });

    it('emits the new value when switched', () => {
      const el = render({ autoRenew: false });

      switchOf(el)?.click();

      expect(fixture.componentInstance.emitted).toEqual([true]);
    });

    it('follows a value written back after a refused change', () => {
      const el = render({ autoRenew: false });
      switchOf(el)?.click();
      update({ autoRenew: true });
      expect(switchOf(el)?.getAttribute('aria-checked')).toBe('true');

      update({ autoRenew: false });

      expect(switchOf(el)?.getAttribute('aria-checked')).toBe('false');
    });

    it('is hidden on a plan that is not live', () => {
      const el = render({ showAutoRenew: false });

      expect(switchOf(el)).toBeNull();
      expect(byTestId(el, 'auto-renew')).toBeNull();
    });

    it('is off and disabled while the plan is cancelling, with the hint to resume', () => {
      const el = render({ autoRenew: true, autoRenewBlocked: true });
      const sw = switchOf(el);

      expect(sw?.getAttribute('aria-checked')).toBe('false');
      expect(sw?.disabled).toBe(true);
      expect(field(el, 'auto-renew-hint')).toBe(
        'hostBilling.autoRenewResumeHint',
      );
      expect(
        el.querySelector(`#${sw?.getAttribute('aria-describedby')}`)
          ?.textContent,
      ).toContain('hostBilling.autoRenewResumeHint');
    });

    it('is busy and disabled while its change is in flight', () => {
      const el = render({ busy: 'autoRenew', locked: true });

      expect(byTestId(el, 'auto-renew')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(switchOf(el)?.disabled).toBe(true);
    });

    it('is not busy while another action is in flight, only disabled', () => {
      const el = render({ busy: 'remove', locked: true });

      expect(byTestId(el, 'auto-renew')?.getAttribute('aria-busy')).toBeNull();
      expect(switchOf(el)?.disabled).toBe(true);
    });
  });

  describe('locked and busy', () => {
    it('locked disables every control and emits nothing', () => {
      const el = render({ locked: true });

      expect(
        (byTestId(el, 'card-save') as HTMLButtonElement | null)?.disabled,
      ).toBe(true);
      expect(
        (byTestId(el, 'card-remove') as HTMLButtonElement | null)?.disabled,
      ).toBe(true);
      byTestId(el, 'card-save')?.click();
      byTestId(el, 'card-remove')?.click();
      switchOf(el)?.click();

      expect(fixture.componentInstance.emitted).toEqual([]);
    });

    it('spins only the action in flight', () => {
      const el = render({ busy: 'remove', locked: true });

      expect(byTestId(el, 'card-remove')?.getAttribute('aria-busy')).toBe(
        'true',
      );
      expect(byTestId(el, 'card-save')?.getAttribute('aria-busy')).toBeNull();

      update({ busy: 'save' });

      expect(byTestId(el, 'card-save')?.getAttribute('aria-busy')).toBe('true');
      expect(byTestId(el, 'card-remove')?.getAttribute('aria-busy')).toBeNull();
    });
  });

  describe('without permission to manage the card', () => {
    it('shows the card read-only, with the owner-only line', () => {
      const el = render({ canManage: false, autoRenew: true });

      expect(byTestId(el, 'card-save')).toBeNull();
      expect(byTestId(el, 'card-remove')).toBeNull();
      expect(switchOf(el)?.getAttribute('aria-checked')).toBe('true');
      expect(switchOf(el)?.disabled).toBe(true);
      expect(byTestId(el, 'card-owner-only')?.textContent?.trim()).toBe(
        'hostBilling.ownerOnly',
      );
    });

    it('has no owner-only line for someone who may manage it', () => {
      const el = render();

      expect(byTestId(el, 'card-owner-only')).toBeNull();
    });

    it('offers no Save a card without a card', () => {
      const el = render({ canManage: false, card: null });

      expect(byTestId(el, 'card-save')).toBeNull();
      expect(field(el, 'no-card')).toBe('hostBilling.noCardSaved');
    });
  });

  it('projects the caller’s error into the card', () => {
    const el = render();

    expect(el.querySelector('hh-card [data-test="projected"]')).not.toBeNull();
  });
});
