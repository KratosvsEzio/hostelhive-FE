import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostelDetail, HostelFormOptions, OfferCategory } from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, HostOpsApi, ImageUploadService, OffersApi } from '@services';
import { HostelForm } from './hostel-form';

const OPTIONS: HostelFormOptions = {
  genderTypes: [{ id: 1, slug: 'boys', name: 'Boys' }],
  propertyTypes: [{ id: 3, slug: 'house', name: 'House' }],
  billingFrequencyTypes: [{ id: 0, slug: 'month', name: 'Month' }],
  occupancyTypes: [{ id: 0, slug: 'shared', name: 'Shared' }],
  attachmentLabels: [
    { id: 11, name: 'Kitchen' },
    { id: 12, name: 'Rooftop' },
  ],
} as unknown as HostelFormOptions;

/** Two photos: one already filed under Kitchen, one with no label. */
const RECORD = {
  id: 1,
  name: 'Ever Care',
  attachments: [
    { id: 'att-1', url: 'https://x/1.jpg', attachment_label: { id: 11, name: 'Kitchen' } },
    { id: 'att-2', url: 'https://x/2.jpg', attachment_label: null },
  ],
  room_types: [],
} as unknown as HostelDetail;

/** `photoLabelMap` and `setPhotoLabel` are `protected`; the spec drives them through this. */
interface FormInternals {
  photoLabelMap: { set: (m: Map<string, string | null>) => void };
  setPhotoLabel: (photo: { id: string }, v: string | null) => void;
}

/**
 * Settles the form before anything is asserted.
 *
 * The record lands through a constructor effect and the options through an observable, and
 * under a loaded test run those had not both flushed by the first assertion — leaving the
 * snapshot comparison inside `dirty()` reading as a change that nobody made.
 */
async function setUp(data: HostelDetail | null = RECORD) {
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
  fixture.componentRef.setInput('mode', 'edit');
  if (data) fixture.componentRef.setInput('initialData', data);
  // Twice: the record is applied by a constructor effect, which flushes the cycle after the
  // input lands.
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    form: fixture.componentInstance,
    vm: fixture.componentInstance as unknown as FormInternals,
  };
}

/**
 * Filing a photo under a label.
 *
 * The dropdown wrote to a signal nothing else read: picking a label left Update disabled, and
 * the label would not have been saved even if it had not, because the hostel payload carries
 * `attachment_ids` and says nothing about what any of them are. Labels go up one PUT each, so
 * what the save needs is the list of what moved — and the form needs to call itself dirty on
 * the strength of it.
 */
describe('HostelForm — photo labels', () => {
  it('starts clean, with nothing to send', async () => {
    const { form } = await setUp();

    expect(form.changedPhotoLabels()).toEqual([]);
    expect(form.dirty()).toBe(false);
  });

  it('notices a label being set on a photo that had none', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-2' }, '12');
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([{ id: 'att-2', labelId: '12' }]);
  });

  // The reported bug: the button stayed disabled, so the change could not be saved at all.
  it('makes the form dirty, so Update can be pressed', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-2' }, '12');
    fixture.detectChanges();

    expect(form.dirty()).toBe(true);
  });

  it('notices a label being changed to a different one', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-1' }, '12');
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([{ id: 'att-1', labelId: '12' }]);
  });

  it('notices a label being cleared', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-1' }, null);
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([{ id: 'att-1', labelId: null }]);
  });

  /**
   * Setting a label back to what it already was is not a change. Otherwise opening the
   * dropdown and re-picking the same entry would leave the form dirty for ever.
   */
  it('ignores a label set to the value it already had', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-1' }, '11');
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([]);
    expect(form.dirty()).toBe(false);
  });

  it('goes back to clean when a label is moved and moved back', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-1' }, '12');
    fixture.detectChanges();
    expect(form.dirty()).toBe(true);

    vm.setPhotoLabel({ id: 'att-1' }, '11');
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([]);
    expect(form.dirty()).toBe(false);
  });

  it('reports every photo that moved', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-1' }, '12');
    vm.setPhotoLabel({ id: 'att-2' }, '11');
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([
      { id: 'att-1', labelId: '12' },
      { id: 'att-2', labelId: '11' },
    ]);
  });

  /**
   * After a save the labels are on the server, so the form has to stop offering to send them
   * again — otherwise Update stays lit and pressing it repeats the same PUTs.
   */
  it('settles once the save reports back', async () => {
    const { form, vm, fixture } = await setUp();

    vm.setPhotoLabel({ id: 'att-2' }, '12');
    fixture.detectChanges();
    expect(form.dirty()).toBe(true);

    form.onSaveSuccess(RECORD);
    fixture.detectChanges();

    expect(form.changedPhotoLabels()).toEqual([]);
    expect(form.dirty()).toBe(false);
  });

  // Create mode has no record to diff against, and its photos are saved with the hostel.
  it('has nothing to send before the hostel exists', async () => {
    const { form } = await setUp(null);

    expect(form.changedPhotoLabels()).toEqual([]);
  });
});
