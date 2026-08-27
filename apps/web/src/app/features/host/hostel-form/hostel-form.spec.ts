import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { HostelDetail, HostelFormOptions, OfferCategory } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, HostOpsApi, ImageUploadService, OffersApi } from '@services';
import { HostelForm } from './hostel-form';

const FROM_HOST_CONSOLE: HostelFormOptions = {
  genderTypes: [{ id: 1, slug: 'boys', name: 'Boys' }],
  propertyTypes: [{ id: 3, slug: 'house', name: 'House' }],
  billingFrequencyTypes: [{ id: 0, slug: 'month', name: 'Month' }],
  occupancyTypes: [{ id: 0, slug: 'shared', name: 'Shared' }],
  attachmentLabels: [],
};

const FROM_MODERATION: HostelFormOptions = {
  ...FROM_HOST_CONSOLE,
  propertyTypes: [{ id: 2, slug: 'building', name: 'Building' }],
};

class HostelsApiStub {
  calls = 0;
  formOptions(): Observable<HostelFormOptions> {
    this.calls++;
    return of(FROM_HOST_CONSOLE);
  }
}

class OffersApiStub {
  calls = 0;
  categories(): Observable<OfferCategory[]> {
    this.calls++;
    return of([]);
  }
}

/**
 * The seams that let one form serve two consoles.
 *
 * The host's hostel profile and the moderator's review screen used to be two hand-rolled
 * forms over the same record, and they drifted: review had no contact fields, no billing
 * cycle, and saved four of a room type's ten columns. They are one component now, which only
 * works if the component stops deciding for itself where its data comes from — hence these.
 */
describe('HostelForm data seams', () => {
  let hostels: HostelsApiStub;
  let offers: OffersApiStub;

  function setUp(): ComponentFixture<HostelForm> {
    TestBed.resetTestingModule();
    hostels = new HostelsApiStub();
    offers = new OffersApiStub();
    TestBed.configureTestingModule({
      imports: [HostelForm],
      providers: [
        provideI18nTesting(),
        { provide: HostelsApi, useValue: hostels },
        { provide: OffersApi, useValue: offers },
        { provide: ImageUploadService, useValue: { upload: () => throwError(() => new Error('x')) } },
        { provide: HostOpsApi, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(HostelForm);
    fixture.componentRef.setInput('mode', 'edit');
    return fixture;
  }

  it('asks the host console endpoint when nobody supplies options', () => {
    const fixture = setUp();
    fixture.detectChanges();

    expect(hostels.calls).toBe(1);
    expect(offers.calls).toBe(1);
  });

  /**
   * The point of the whole exercise.
   *
   * Moderation has its own `/api/moderator/hostels/new` and its own catalogue, loaded with the
   * listing. A form that reaches for `/api/hostels/new` regardless can only ever live on one
   * screen — and asking the host's endpoint from the moderator's console is not merely a
   * wasted request, it is the wrong console's answer.
   */
  it('uses what it is given, and does not call the host endpoint at all', () => {
    const fixture = setUp();
    fixture.componentRef.setInput('options', FROM_MODERATION);
    fixture.componentRef.setInput('catalogue', [] as OfferCategory[]);
    fixture.detectChanges();

    expect(hostels.calls).toBe(0);
    expect(offers.calls).toBe(0);
  });
});

/**
 * How hard the form insists on a complete record.
 *
 * `edit` deliberately checks almost nothing: a host opening their profile should not be told
 * off for a field their listing predates. Approval is the opposite — a moderator is deciding
 * whether this goes live, and the checklist gating Approve & publish is these same rules.
 */
describe('HostelForm requireComplete', () => {
  function setUp(requireComplete: boolean): HostelForm {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostelForm],
      providers: [
        provideI18nTesting(),
        { provide: HostelsApi, useValue: new HostelsApiStub() },
        { provide: OffersApi, useValue: new OffersApiStub() },
        { provide: ImageUploadService, useValue: {} },
        { provide: HostOpsApi, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(HostelForm);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('requireComplete', requireComplete);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('lets an incomplete existing record be edited in peace', () => {
    expect(setUp(false).isValid()).toBe(true);
  });

  it('holds an empty record back when it is being approved', () => {
    const form = setUp(true);
    const errors = form.fieldErrors();

    expect(form.isValid()).toBe(false);
    expect(errors['name']).toBeTruthy();
    expect(errors['description']).toBeTruthy();
    expect(errors['location']).toBeTruthy();
    // Only asked under requireComplete — a create form with no photos yet is not an error.
    expect(errors['photos']).toBeTruthy();
  });
});

/**
 * The hostel's own contact details.
 *
 * These were wrapped in `@if (mode() === 'create')`, so the only screen that ever showed
 * them was the one that creates a listing. Both screens that edit a *live* one — the host's
 * profile and the moderator's review — could neither see nor correct the address and number
 * a seeker uses to reach the place. And because they never rendered on edit, nothing seeded
 * them: `email` was hard-coded to the empty string on load, so the form could write an
 * address once and never read it back.
 */
describe('HostelForm contact details', () => {
  function setUp(mode: 'create' | 'edit', data: Partial<HostelDetail> | null = null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostelForm],
      providers: [
        provideI18nTesting(),
        { provide: HostelsApi, useValue: new HostelsApiStub() },
        { provide: OffersApi, useValue: new OffersApiStub() },
        { provide: ImageUploadService, useValue: {} },
        { provide: HostOpsApi, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(HostelForm);
    fixture.componentRef.setInput('mode', mode);
    if (data) fixture.componentRef.setInput('initialData', data as HostelDetail);
    // Twice: the record is applied by a constructor effect, which flushes on the cycle
    // after the input lands.
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('renders them when editing, not only when creating', () => {
    const html = setUp('edit', { id: 1, name: 'Ever Care' }).nativeElement.textContent ?? '';
    // The i18n test harness renders keys rather than copy, so assert on the keys.
    expect(html).toContain('common.contactEmail');
    expect(html).toContain('common.primaryPhone');
  });

  /**
   * The round trip. A form that writes a value it can never load shows every returning host a
   * blank required field and quietly invites them to retype what they already gave.
   *
   * Only the address is asserted here. The number is bound through `hh-phone-input`, which
   * wraps `ngx-material-intl-tel-input` — that widget geo-locates the caller over HTTP to
   * pre-select a country, cannot start up under jsdom, and emits an empty `currentValue` when
   * it fails. Asserting on it would be testing the harness, not the form.
   */
  it('loads the contact address back off the record', () => {
    const form = setUp('edit', {
      id: 1,
      name: 'Ever Care',
      email: 'stay@evercare.pk',
    }).componentInstance as unknown as { email(): string };

    expect(form.email()).toBe('stay@evercare.pk');
  });

  it('still rejects a malformed address, in any mode', () => {
    const fixture = setUp('edit', { id: 1, name: 'Ever Care', email: 'not-an-address' });
    expect(fixture.componentInstance.fieldErrors()['email']).toBeTruthy();
  });

  /**
   * Approving asks for *a* way to reach the hostel, not specifically an email.
   *
   * Every existing listing predates these fields being editable, and some serializers may
   * not return an address at all — refusing to publish a hostel that carries a phone number
   * would block it on a field its host was never shown.
   */
  it('accepts a phone number alone when approving', () => {
    const fixture = setUp('edit', { id: 1, name: 'Ever Care' });
    // Set through the signal rather than the record: the number arrives via `hh-phone-input`,
    // which does not start up under jsdom. The rule under test is this form's, not the widget's.
    (fixture.componentInstance as unknown as { phone: { set(v: string): void } }).phone.set(
      '+923001234567',
    );
    fixture.componentRef.setInput('requireComplete', true);
    fixture.detectChanges();

    const errors = fixture.componentInstance.fieldErrors();
    expect(errors['contact']).toBeUndefined();
    expect(errors['email']).toBeUndefined();
  });

  it('flags a listing with no way to reach it at all', () => {
    const fixture = setUp('edit', { id: 1, name: 'Ever Care' });
    fixture.componentRef.setInput('requireComplete', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.fieldErrors()['contact']).toBeTruthy();
  });
});
