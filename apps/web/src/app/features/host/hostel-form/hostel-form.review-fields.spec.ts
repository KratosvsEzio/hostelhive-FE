import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostelDetail, HostelFormOptions, OfferCategory } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, HostOpsApi, ImageUploadService, OffersApi } from '@services';
import { EditRoomType, HostelForm } from './hostel-form';

const OPTIONS: HostelFormOptions = {
  genderTypes: [{ id: 1, slug: 'boys', name: 'Boys' }],
  propertyTypes: [{ id: 3, slug: 'house', name: 'House' }],
  billingFrequencyTypes: [
    { id: 0, slug: 'month', name: 'Month' },
    { id: 1, slug: 'day', name: 'Day' },
  ],
  occupancyTypes: [{ id: 0, slug: 'shared', name: 'Shared' }],
  attachmentLabels: [],
};

/** The form's field signals are `protected`; the spec drives them through this shape. */
interface FormInternals {
  name: WritableSignal<string>;
  description: WritableSignal<string>;
  email: WritableSignal<string>;
  phone: WritableSignal<string>;
  secondaryPhone: WritableSignal<string>;
  billingFrequency: WritableSignal<string>;
  landmarks: WritableSignal<string>;
  roomTypes: WritableSignal<EditRoomType[]>;
}

const RECORD = {
  id: 1,
  name: 'Ever Care',
  description: '<p>Quiet and clean.</p>',
  email: 'host@example.com',
  phone: '+923001234567',
  secondary_phone: '+923009999999',
  nearby_landmarks: 'Superior University',
  room_types: [
    { id: 7, name: 'Dormitory', capacity: 6, price: 12000, description: 'Six beds, lockers.' },
  ],
} as unknown as HostelDetail;

function setUp(mode: 'create' | 'edit' = 'edit', data: HostelDetail | null = RECORD) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [HostelForm],
    providers: [
      provideI18nTesting(),
      {
        provide: HostelsApi,
        useValue: { formOptions: (): Observable<HostelFormOptions> => of(OPTIONS) },
      },
      { provide: OffersApi, useValue: { categories: (): Observable<OfferCategory[]> => of([]) } },
      { provide: ImageUploadService, useValue: {} },
      { provide: HostOpsApi, useValue: {} },
    ],
  });
  const fixture: ComponentFixture<HostelForm> = TestBed.createComponent(HostelForm);
  fixture.componentRef.setInput('mode', mode);
  if (data) fixture.componentRef.setInput('initialData', data);
  // Twice: the record is applied by a constructor effect, which flushes on the cycle after
  // the input lands.
  fixture.detectChanges();
  fixture.detectChanges();
  return {
    fixture,
    form: fixture.componentInstance,
    vm: fixture.componentInstance as unknown as FormInternals,
  };
}

/**
 * Which edits cost a host their visibility.
 *
 * Changing any of these sends the listing back to moderation, where it is delisted until
 * somebody approves it. The host is warned first — but only if this computed notices, and a
 * miss here is silent in the worst direction: the save goes through, the modal never appears,
 * and the property drops out of search with nothing having said it would.
 *
 * The opposite error is just as bad in its own way. Warning on an edit that does *not* trigger
 * review teaches hosts that the dialogue is noise, and then it is not read on the day it
 * matters.
 */
describe('HostelForm — review-triggering fields', () => {
  it('finds nothing on a freshly loaded record', () => {
    const { form } = setUp();

    expect(form.reviewTriggerKeys()).toEqual([]);
  });

  it('names the property name', () => {
    const { form, vm } = setUp();

    vm.name.set('Ever Care Boys Hostel');

    expect(form.reviewTriggerKeys()).toEqual(['common.propertyName']);
  });

  it('names each of the contact details separately', () => {
    const { form, vm } = setUp();

    vm.email.set('new@example.com');
    vm.phone.set('+923111111111');
    vm.secondaryPhone.set('+923222222222');

    expect(form.reviewTriggerKeys()).toEqual([
      'common.contactEmail',
      'common.primaryPhone',
      'common.secondaryPhone',
    ]);
  });

  it('names the description and the billing frequency', () => {
    const { form, vm } = setUp();

    vm.description.set('<p>Rewritten.</p>');
    vm.billingFrequency.set('day');

    expect(form.reviewTriggerKeys()).toEqual([
      'common.description',
      'hostelForm.billingFrequency',
    ]);
  });

  /**
   * The half that matters most for trust in the dialogue.
   *
   * Landmarks sit in the same form and are just as editable, and a host who is warned about
   * them learns the warning means nothing.
   */
  it('stays quiet for a field moderation does not re-read', () => {
    const { form, vm } = setUp();

    vm.landmarks.set('Next to the metro');

    expect(form.reviewTriggerKeys()).toEqual([]);
  });

  it('lists them in one order, however many changed', () => {
    const { form, vm } = setUp();

    vm.billingFrequency.set('day');
    vm.name.set('Renamed');

    // Declaration order, not the order they were typed in — a list that reshuffles between
    // two glances reads as a different list.
    expect(form.reviewTriggerKeys()).toEqual([
      'common.propertyName',
      'hostelForm.billingFrequency',
    ]);
  });

  describe('room type descriptions', () => {
    it('notices an edit to an existing one', () => {
      const { form, vm } = setUp();
      const [rt] = vm.roomTypes();

      vm.roomTypes.set([{ ...rt, description: 'Six beds, lockers, and a fan.' }]);

      expect(form.reviewTriggerKeys()).toEqual(['hostelForm.roomTypeDescription']);
    });

    // Prose the moderator has never seen, which is the thing being guarded.
    it('notices a new room type that carries one', () => {
      const { form, vm } = setUp();

      vm.roomTypes.set([
        ...vm.roomTypes(),
        { ...vm.roomTypes()[0], _key: 'new-1', id: undefined, description: 'Brand new prose.' },
      ]);

      expect(form.reviewTriggerKeys()).toEqual(['hostelForm.roomTypeDescription']);
    });

    it('ignores a new room type with no description', () => {
      const { form, vm } = setUp();

      vm.roomTypes.set([
        ...vm.roomTypes(),
        { ...vm.roomTypes()[0], _key: 'new-1', id: undefined, description: '' },
      ]);

      expect(form.reviewTriggerKeys()).toEqual([]);
    });

    // Price and capacity are numbers a moderator does not read for content.
    it('ignores a room type edit that is not the description', () => {
      const { form, vm } = setUp();
      const [rt] = vm.roomTypes();

      vm.roomTypes.set([{ ...rt, price: 15000, capacity: 8 }]);

      expect(form.reviewTriggerKeys()).toEqual([]);
    });
  });

  /**
   * A listing being created has no approved version to fall back from, and every field on it
   * is new to the moderator anyway.
   */
  it('says nothing at all in create mode', () => {
    const { form, vm } = setUp('create', null);

    vm.name.set('A brand new hostel');
    vm.email.set('new@example.com');

    expect(form.reviewTriggerKeys()).toEqual([]);
  });
});
