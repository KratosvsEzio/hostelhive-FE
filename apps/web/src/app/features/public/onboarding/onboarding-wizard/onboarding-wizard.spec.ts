import { Signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiError, HostelInput } from '@hostelhive/data-access';
import { HostelsApi, OffersApi } from '@services';
import { AuthService } from '@app/core/auth/auth.service';
import { provideDataAccess } from '@core/provide-data-access';
import { OnboardingWizard } from './onboarding-wizard';

const DRAFT_KEY = 'hh:onboarding:draft';

interface MediaItem {
  id: number;
  label: string;
  primary: boolean;
  url?: string;
  attachmentId?: string;
}

/** The component's members are `protected`; the spec asserts on them through this shape. */
interface WizardInternals {
  name: WritableSignal<string>;
  city: WritableSignal<string>;
  description: WritableSignal<string>;
  email: WritableSignal<string>;
  phone: WritableSignal<string>;
  media: WritableSignal<MediaItem[]>;
  locationPinned: WritableSignal<boolean>;
  draftId: WritableSignal<number | null>;
  draftError: WritableSignal<boolean>;
  showValidationModal: WritableSignal<boolean>;
  showLeaveModal: WritableSignal<boolean>;
  apiErrors: Signal<string[]>;
  showDraftStatus: Signal<boolean>;
  deviceDraftPresent: Signal<boolean>;
  exitLabel: Signal<string>;
  isFormValid: Signal<boolean>;
  newRoomType: WritableSignal<string>;
  newRoomCapacity: WritableSignal<number>;
  newRoomPrice: WritableSignal<number>;
  capacityFixed: Signal<boolean>;
  roomFormError: Signal<string | null>;
  rooms: WritableSignal<{ id: number; type: string; capacity: number; price: number }[]>;
  setNewRoomCapacity(raw: string): void;
  addRoom(): void;
  saveAndExit(): void;
  onLogoClick(event: MouseEvent): void;
  confirmLeave(): void;
}

function internals(fixture: ComponentFixture<OnboardingWizard>): WizardInternals {
  return fixture.componentInstance as unknown as WizardInternals;
}

/** Records every write to `attachment_ids`, so a duplicated flush is visible to the spec. */
function stubHostelsApi() {
  const create = vi.fn<(input: HostelInput) => Observable<unknown>>(() =>
    of({ id: 42 }),
  );
  const update = vi.fn<(id: number | string, input: HostelInput) => Observable<unknown>>(
    () => of({ id: 42 }),
  );
  return {
    create,
    update,
    api: {
      create,
      update,
      formOptions: () =>
        of({ genderTypes: [], propertyTypes: [], attachmentLabels: [] }),
    },
  };
}

function render() {
  const hostels = stubHostelsApi();
  const refreshSession = vi.fn(() => of({ id: '1' }));
  TestBed.configureTestingModule({
    imports: [OnboardingWizard],
    providers: [
      provideRouter([]),
      provideDataAccess({ baseUrl: 'https://api.test' }),
      { provide: HostelsApi, useValue: hostels.api },
      { provide: OffersApi, useValue: { categories: () => of([]) } },
      { provide: AuthService, useValue: { refreshSession } },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi
    .spyOn(router, 'navigate')
    .mockImplementation(() => Promise.resolve(true));
  const fixture = TestBed.createComponent(OnboardingWizard);
  fixture.detectChanges();
  return { fixture, vm: internals(fixture), hostels, navigate, refreshSession };
}

/** Fills every field `fieldErrors` guards, so `isFormValid()` becomes true. */
function fillValidForm(vm: WizardInternals): void {
  vm.name.set('Sunrise Boys Hostel');
  vm.city.set('Karachi');
  vm.description.set('<p>A clean, quiet hostel.</p>');
  vm.email.set('host@example.com');
  vm.phone.set('+923001234567');
  vm.locationPinned.set(true);
  vm.media.set([
    { id: 1, label: 'front.jpg', primary: true, url: 'https://cdn/1', attachmentId: 'att-1' },
  ]);
}

describe('OnboardingWizard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('save & exit', () => {
    it('leaves for home without touching the API when the form is incomplete', () => {
      const { vm, hostels, navigate } = render();

      vm.saveAndExit();

      expect(hostels.create).not.toHaveBeenCalled();
      expect(hostels.update).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('keeps the local draft restorable after an incomplete exit', () => {
      const { vm } = render();
      vm.name.set('Half-typed hostel');

      vm.saveAndExit();

      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
      expect(saved.name).toBe('Half-typed hostel');
    });

    it('never opens the validation modal, even with fields missing', () => {
      const { vm, navigate } = render();
      expect(vm.isFormValid()).toBe(false);

      vm.saveAndExit();

      expect(vm.showValidationModal()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('creates the hostel and refreshes the session when the form is valid', () => {
      const { vm, hostels, navigate, refreshSession } = render();
      fillValidForm(vm);

      vm.saveAndExit();

      expect(hostels.create).toHaveBeenCalledTimes(1);
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/']);
      expect(vm.draftId()).toBe(42);
    });

    it('updates the existing record with the partial payload, rooms excluded', () => {
      const { vm, hostels, navigate, refreshSession } = render();
      vm.draftId.set(7);
      vm.name.set('Only a name so far');

      vm.saveAndExit();

      expect(hostels.create).not.toHaveBeenCalled();
      expect(hostels.update).toHaveBeenCalledTimes(1);
      const [id, input] = hostels.update.mock.calls[0];
      expect(id).toBe(7);
      expect(input.name).toBe('Only a name so far');
      expect(input.room_types_attributes).toBeUndefined();
      expect(refreshSession).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('stays on the page and surfaces the errors when the save is rejected', () => {
      const { vm, hostels, navigate } = render();
      // The component reads `serverMessages`, which the error interceptor adds when it
      // normalises a raw HttpErrorResponse into an ApiError. The API is mocked here, so
      // the interceptor never runs — throw what it would have produced for a 422 carrying
      // a Rails `errors[]` envelope, not the raw response.
      hostels.update.mockReturnValue(
        throwError(
          (): ApiError => ({
            status: 422,
            code: 'unknown_error',
            message: 'City is invalid',
            serverMessages: ['City is invalid'],
            method: 'PATCH',
          }),
        ),
      );
      vm.draftId.set(7);

      vm.saveAndExit();

      expect(navigate).not.toHaveBeenCalled();
      expect(vm.draftError()).toBe(true);
      expect(vm.apiErrors()).toEqual(['City is invalid']);
    });

    it('sends each attachment id at most once across repeated saves', () => {
      const { vm, hostels } = render();
      vm.draftId.set(7);
      vm.media.set([
        { id: 1, label: 'a.jpg', primary: true, url: 'https://cdn/1', attachmentId: 'att-1' },
      ]);

      vm.saveAndExit();
      vm.saveAndExit();

      expect(hostels.update).toHaveBeenCalledTimes(2);
      expect(hostels.update.mock.calls[0][1].attachment_ids).toEqual(['att-1']);
      expect(hostels.update.mock.calls[1][1].attachment_ids).toBeUndefined();
    });

    it('does nothing while a photo is still uploading', () => {
      const { fixture, vm, hostels, navigate } = render();
      fillValidForm(vm);
      startUpload(fixture);

      vm.saveAndExit();

      expect(hostels.create).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('labels the button for the busy state it is in', () => {
      const { fixture, vm } = render();
      expect(vm.exitLabel()).toBe('Save & exit');

      startUpload(fixture);

      expect(vm.exitLabel()).toBe('Uploading photos…');
    });
  });

  describe('logo', () => {
    it('is a link to home', () => {
      const { fixture } = render();
      const logo = fixture.nativeElement.querySelector(
        'header a[href="/"]',
      ) as HTMLAnchorElement | null;
      expect(logo).not.toBeNull();
      expect(logo?.querySelector('img')?.getAttribute('alt')).toBe('HostelHive');
    });

    it('lets the router handle the click when nothing is uploading', () => {
      const { vm } = render();
      const event = new MouseEvent('click', { cancelable: true });

      vm.onLogoClick(event);

      expect(event.defaultPrevented).toBe(false);
      expect(vm.showLeaveModal()).toBe(false);
    });

    it('asks for confirmation instead of navigating mid-upload', () => {
      const { fixture, vm } = render();
      startUpload(fixture);
      const event = new MouseEvent('click', { cancelable: true });

      vm.onLogoClick(event);

      expect(event.defaultPrevented).toBe(true);
      expect(vm.showLeaveModal()).toBe(true);
    });

    it('leaves for home once the upload loss is accepted', () => {
      const { fixture, vm, navigate } = render();
      startUpload(fixture);
      vm.onLogoClick(new MouseEvent('click', { cancelable: true }));

      vm.confirmLeave();

      expect(vm.showLeaveModal()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('room capacity', () => {
    it('presets and locks the capacity for a fixed room type', () => {
      const { vm } = render();

      vm.newRoomType.set('Quad sharing');

      expect(vm.newRoomCapacity()).toBe(4);
      expect(vm.capacityFixed()).toBe(true);
    });

    it('defaults a dormitory to 5 without inheriting the previous type', () => {
      const { vm } = render();
      vm.newRoomType.set('Quad sharing');

      vm.newRoomType.set('Dormitory');

      expect(vm.newRoomCapacity()).toBe(5);
      expect(vm.capacityFixed()).toBe(false);
    });

    it('keeps a manual dormitory capacity until the type changes', () => {
      const { vm } = render();
      vm.newRoomType.set('Dormitory');

      vm.setNewRoomCapacity('7');
      expect(vm.newRoomCapacity()).toBe(7);

      vm.newRoomType.set('Single room');
      expect(vm.newRoomCapacity()).toBe(1);
    });

    it('clamps and floors a committed capacity into 1..9', () => {
      const { vm } = render();
      vm.newRoomType.set('Dormitory');

      vm.setNewRoomCapacity('12');
      expect(vm.newRoomCapacity()).toBe(9);

      vm.setNewRoomCapacity('4.7');
      expect(vm.newRoomCapacity()).toBe(4);
    });

    it('keeps the last good value for empty or non-numeric input', () => {
      const { vm } = render();
      vm.newRoomType.set('Dormitory');
      vm.setNewRoomCapacity('6');

      vm.setNewRoomCapacity('');
      vm.setNewRoomCapacity('abc');

      expect(vm.newRoomCapacity()).toBe(6);
    });

    it('adds a room whose capacity matches its fixed type', () => {
      const { vm } = render();
      vm.rooms.set([]);
      vm.newRoomType.set('Triple sharing');
      vm.newRoomPrice.set(14000);

      vm.addRoom();

      const added = vm.rooms().find((r) => r.type === 'Triple sharing');
      expect(added?.capacity).toBe(3);
    });

    it('blocks a zero price with an inline message before adding', () => {
      const { vm } = render();
      vm.rooms.set([]);
      vm.newRoomType.set('Single room');
      vm.newRoomPrice.set(0);

      vm.addRoom();

      expect(vm.rooms()).toHaveLength(0);
      expect(vm.roomFormError()).toBeTruthy();
    });
  });

  describe('draft restore', () => {
    it('does not resurrect a persisted capacity for a fixed-capacity type', () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ newRoomType: 'Quad sharing', newRoomCapacity: 1, rooms: [] }),
      );

      const { vm } = render();

      expect(vm.newRoomType()).toBe('Quad sharing');
      expect(vm.capacityFixed()).toBe(true);
      expect(vm.newRoomCapacity()).toBe(4);
    });
  });

  describe('save status chip', () => {
    it('claims nothing on an untouched form', () => {
      const { fixture, vm } = render();
      expect(vm.deviceDraftPresent()).toBe(false);
      expect(vm.showDraftStatus()).toBe(false);
      expect(fixture.nativeElement.querySelector('header')?.textContent).not.toContain(
        'Draft saved',
      );
    });

    it('reports a device-only draft once something has been entered', () => {
      const { fixture, vm } = render();
      vm.name.set('Sunrise');
      fixture.detectChanges();

      expect(vm.showDraftStatus()).toBe(true);
      expect(fixture.nativeElement.querySelector('header')?.textContent).toContain(
        'Saved on this device',
      );
    });
  });
});

/** Drives the component's private upload progress map so `uploading()` reads true. */
function startUpload(fixture: ComponentFixture<OnboardingWizard>): void {
  const target = fixture.componentInstance as unknown as {
    uploadingPhotos: WritableSignal<Map<string, number>>;
  };
  target.uploadingPhotos.set(new Map([['1', 25]]));
}
