import { Component, forwardRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HostelDetail } from '@hostelhive/data-access';
import { SessionStore } from '@core/auth/session-store';
import { HostelsApi, HostPropertyStore } from '@services';
import { HostBookingsApi } from '../bookings/host-bookings-api';
import { HostelForm } from '../hostel-form/hostel-form';
import { HostelProfile } from './hostel-profile';

const HOSTEL_ID = 'MjvuEl';
const QUIET = { suppressErrorToast: true };

/**
 * Stands in for the real form, which drags in maps, uploads and the whole hostel API.
 *
 * `viewChild(HostelForm)` queries by type, so the stub answers to that token. What is under
 * test is how the page saves, not what the form collects.
 */
@Component({
  selector: 'hh-hostel-form',
  template: '',
  providers: [{ provide: HostelForm, useExisting: forwardRef(() => StubHostelForm) }],
})
class StubHostelForm {
  readonly dirty = () => true;
  readonly uploading = () => false;
  readonly isValid = () => true;
  readonly reviewTriggerKeys = () => [];
  readonly getPayload = () => ({ name: 'Backpacker' });
  readonly changedPhotoLabels = () => [{ id: 'a1', labelId: '7' }];
  readonly changedPrimaryPhoto = () => 'a2';
  readonly onSaveSuccess = vi.fn();
}

/** The component's members are `protected`; the spec drives them through this shape. */
interface Internals {
  save(): void;
  saving(): boolean;
  saveError(): boolean;
}

/**
 * A failed save is shown in the page header, translated, and only there: every write in the
 * save opts out of the global toast, which would otherwise repeat it.
 */
describe('HostelProfile save failures', () => {
  function setUp(hostels: Record<string, unknown>): Internals {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostelProfile],
      providers: [
        { provide: HostelsApi, useValue: { getForEdit: () => of({ id: HOSTEL_ID } as unknown as HostelDetail), ...hostels } },
        { provide: HostPropertyStore, useValue: { selected: () => HOSTEL_ID, setProperty: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: { paramMap: of(convertToParamMap({ hostelId: HOSTEL_ID })) } } },
        // An admin: the time-zone lock is not asked for, so the bookings API stays unused.
        { provide: SessionStore, useValue: { hasRole: () => true } },
        { provide: HostBookingsApi, useValue: {} },
      ],
    }).overrideComponent(HostelProfile, { set: { template: '<hh-hostel-form />', imports: [StubHostelForm] } });
    const fixture = TestBed.createComponent(HostelProfile);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as Internals;
  }

  it('saves the hostel quietly and flags the failure inline when it is refused', () => {
    const update = vi.fn(() => throwError(() => ({ status: 422, serverMessages: ['Name is too long'] })));
    const page = setUp({ update });

    page.save();

    expect(update).toHaveBeenCalledWith(HOSTEL_ID, { name: 'Backpacker' }, QUIET);
    expect(page.saveError()).toBe(true);
    expect(page.saving()).toBe(false);
  });

  it('sends the photo label and primary writes quietly too, and flags their failure inline', () => {
    const updateAttachmentLabel = vi.fn(() => throwError(() => ({ status: 500 })));
    const markAttachmentAsPrimary = vi.fn(() => of(undefined));
    const page = setUp({
      update: () => of({ id: HOSTEL_ID } as unknown as HostelDetail),
      updateAttachmentLabel,
      markAttachmentAsPrimary,
    });

    page.save();

    expect(updateAttachmentLabel).toHaveBeenCalledWith('a1', '7', QUIET);
    expect(markAttachmentAsPrimary).toHaveBeenCalledWith('a2', QUIET);
    expect(page.saveError()).toBe(true);
  });
});
