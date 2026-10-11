import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { LocaleStore } from '@core/i18n/locale-store';
import { PlanCard, PlanCardPlan } from './plan-card';

@Component({
  imports: [PlanCard],
  template: `
    <hh-plan-card [plan]="plan()">
      <a class="projected-action" href="/somewhere">Choose</a>
    </hh-plan-card>
  `,
})
class HostComponent {
  readonly plan = signal<PlanCardPlan>({
    name: 'Starter',
    price: '18.00',
    currency: 'USD',
    features: [],
  });
}

const FEATURE_KEYS = [
  'sharedBilling.featureListing',
  'sharedBilling.featureBoost',
  'sharedBilling.featureCrm',
];

/** Plan cards are shared by the public pricing page and the host billing screen. */
describe('PlanCard', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  function render(plan: Partial<PlanCardPlan>): void {
    fixture.componentInstance.plan.update((current) => ({
      ...current,
      ...plan,
    }));
    fixture.detectChanges();
  }

  function rows(): {
    text: string;
    included: boolean;
    icon: string;
    hidden: string;
  }[] {
    return Array.from(el.querySelectorAll('li')).map((li) => ({
      text: li.textContent?.trim() ?? '',
      included: li.getAttribute('data-included') === 'true',
      icon: li.querySelector('i')?.className ?? '',
      hidden: li.querySelector('.sr-only')?.textContent?.trim() ?? '',
    }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideI18nTesting(),
        { provide: LocaleStore, useValue: { active: () => 'en' } },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows the plan name as returned', () => {
    render({ name: 'Listing + CRM' });
    expect(el.querySelector('h3')?.textContent?.trim()).toBe('Listing + CRM');
  });

  it('renders a USD price with the dollar sign, isolated in bdi, per month', () => {
    render({ price: '18.00', currency: 'USD' });
    expect(el.querySelector('bdi')?.textContent?.trim()).toBe('$18');
    expect(el.textContent).toContain('sharedBilling.perMonth');
    expect(el.textContent).not.toContain('sharedBilling.notAvailableIn');
  });

  it('renders a PKR price by its code, isolated in bdi', () => {
    render({ price: '5000.00', currency: 'PKR' });
    expect(el.querySelector('bdi')?.textContent?.trim()).toBe('PKR 5,000');
    expect(el.textContent).toContain('sharedBilling.perMonth');
  });

  it('keeps the cents of a fractional USD price', () => {
    render({ price: '18.50', currency: 'USD' });
    expect(el.querySelector('bdi')?.textContent?.trim()).toBe('$18.50');
  });

  it('says the plan is not available in the currency when the price is null', () => {
    render({ price: null, currency: 'PKR' });
    expect(el.querySelector('bdi')).toBeNull();
    expect(el.textContent).not.toContain('sharedBilling.perMonth');
    expect(el.textContent).toContain('sharedBilling.notAvailableIn');
  });

  it('lists Listing, Boost and CRM in that order whatever the plan', () => {
    render({ features: ['crm', 'boost'] });
    expect(rows().map((row) => row.text.split(/\s/)[0])).toEqual(FEATURE_KEYS);
  });

  const cases: { features: string[]; included: boolean[] }[] = [
    { features: [], included: [true, false, false] },
    { features: ['boost'], included: [true, true, false] },
    { features: ['crm'], included: [true, false, true] },
    { features: ['boost', 'crm'], included: [true, true, true] },
  ];

  for (const { features, included } of cases) {
    it(`ticks Listing always and the add-ons from [${features.join(', ')}]`, () => {
      render({ features });
      expect(rows().map((row) => row.included)).toEqual(included);
    });
  }

  it('pairs each row with a matching icon and spoken status', () => {
    render({ features: ['boost'] });
    const [listing, boost, crm] = rows();

    for (const row of [listing, boost]) {
      expect(row.icon).toContain('ti-circle-check');
      expect(row.icon).not.toContain('ti-circle-x');
      expect(row.hidden).toContain('sharedBilling.included');
      expect(row.hidden).not.toContain('sharedBilling.notIncluded');
    }
    expect(crm.icon).toContain('ti-circle-x');
    expect(crm.icon).not.toContain('ti-circle-check');
    expect(crm.hidden).toContain('sharedBilling.notIncluded');
  });

  it('hides the icons from assistive technology', () => {
    for (const icon of Array.from(el.querySelectorAll('li i'))) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('ignores feature codes it does not know', () => {
    render({ features: ['lead-radar'] });
    expect(rows()).toHaveLength(3);
    expect(rows().map((row) => row.included)).toEqual([true, false, false]);
  });

  it('renders the projected action inside the card, after the checklist', () => {
    const action = el.querySelector('hh-plan-card .projected-action');
    expect(action?.textContent).toBe('Choose');
    const list = el.querySelector('hh-plan-card ul') as HTMLElement;
    expect(
      list.compareDocumentPosition(action as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
