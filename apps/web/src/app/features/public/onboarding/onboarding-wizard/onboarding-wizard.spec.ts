import { Signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiError, HostelInput } from '@hostelhive/data-access';
import { HostPropertyStore, HostelsApi, OffersApi } from '@services';
import { AuthService } from '@app/core/auth/auth.service';
import { SessionStore, SessionUser } from '@app/core/auth/session-store';
import { provideDataAccess } from '@core/provide-data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
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
  secondaryPhone: WritableSignal<string>;
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
  propertyType: WritableSignal<'apartment' | 'room' | 'building' | 'house' | ''>;
  propertyTypeOptions: Signal<{ value: string; label: string }[]>;
  setPropertyType(v: string | string[] | null): void;
  setNewRoomCapacity(raw: string): void;
  addRoom(): void;
  saveAndExit(): void;
  saveAndContinue(): void;
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
  const markAttachmentAsPrimary = vi.fn<(attachmentId: string) => Observable<void>>(() =>
    of(undefined),
  );
  return {
    create,
    update,
    markAttachmentAsPrimary,
    api: {
      create,
      update,
      markAttachmentAsPrimary,
      formOptions: () =>
        of({
          genderTypes: [],
          propertyTypes: [
            { id: 0, slug: 'apartment', name: 'APARTMENT' },
            { id: 2, slug: 'building', name: 'Building' },
          ],
          attachmentLabels: [],
        }),
    },
  };
}

function user(id: string): SessionUser {
  return {
    id,
    name: id.toUpperCase(),
    email: `${id}@h.pk`,
    role: 'seeker',
    allRoles: ['seeker'],
    permissions: [],
  };
}

/** The draft as it sits on disk, or null when the key is absent. */
function storedDraft(): Record<string, unknown> | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

/** What the error interceptor turns a 422 with a Rails `errors[]` envelope into. */
function rejectedSave(method: string): Observable<never> {
  return throwError(
    (): ApiError => ({
      status: 422,
      code: 'unknown_error',
      message: 'City is invalid',
      serverMessages: ['City is invalid'],
      method,
    }),
  );
}

/** `signedIn: null` mounts the wizard with nobody signed in. */
function render(signedIn: SessionUser | null = user('u1')) {
  const hostels = stubHostelsApi();
  const refreshSession = vi.fn(() => of({ id: '1' }));
  const loadHostels = vi.fn();
  TestBed.configureTestingModule({
    imports: [OnboardingWizard],
    providers: [
      provideRouter([]),
      // The wizard's logo is an <a routerLink>, so LocaleLink — and with it Transloco —
      // is now part of rendering it.
      provideI18nTesting(),
      provideDataAccess({ baseUrl: 'https://api.test' }),
      { provide: HostelsApi, useValue: hostels.api },
      { provide: OffersApi, useValue: { categories: () => of([]) } },
      { provide: AuthService, useValue: { refreshSession } },
      { provide: HostPropertyStore, useValue: { load: loadHostels } },
    ],
  });
  // The draft is kept per user, so the wizard needs someone signed in to restore or save it.
  const session = TestBed.inject(SessionStore);
  if (signedIn) session.setSession(signedIn, 'tok');
  const router = TestBed.inject(Router);
  const navigate = vi
    .spyOn(router, 'navigate')
    .mockImplementation(() => Promise.resolve(true));
  let fixture = TestBed.createComponent(OnboardingWizard);
  fixture.detectChanges();

  /**
   * Tears the wizard down and mounts a fresh one in the same TestBed, so the session and
   * localStorage carry over as they do between two visits. `between` runs while no wizard is
   * mounted — the place to sign someone else in.
   */
  function remount(between?: () => void) {
    fixture.destroy();
    between?.();
    fixture = TestBed.createComponent(OnboardingWizard);
    fixture.detectChanges();
    return { fixture, vm: internals(fixture) };
  }

  return {
    fixture,
    vm: internals(fixture),
    hostels,
    navigate,
    refreshSession,
    loadHostels,
    session,
    remount,
  };
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

  describe('save & continue', () => {
    it('creates the hostel, refreshes the session, then opens its billing page', () => {
      const { vm, hostels, navigate, refreshSession } = render();
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(hostels.create).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/host', 42, 'subscription']);
      // The new host role has to be on the session before the console's role guard runs.
      expect(refreshSession.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0],
      );
    });

    it('updates an existing draft and opens its billing page without a session refresh', () => {
      const { vm, hostels, navigate, refreshSession } = render();
      fillValidForm(vm);
      vm.draftId.set(7);

      vm.saveAndContinue();

      expect(hostels.update).toHaveBeenCalledTimes(1);
      expect(refreshSession).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/host', 7, 'subscription']);
    });

    // The console's hostel-id gate trusts a loaded list, which predates the hostel just saved.
    it('refetches the hostel list before navigating', () => {
      const { vm, navigate, loadHostels } = render();
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(loadHostels).toHaveBeenCalledTimes(1);
      expect(loadHostels.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0],
      );
    });

    it('still opens the billing page when the session refresh fails', () => {
      const { vm, navigate, refreshSession } = render();
      refreshSession.mockReturnValue(throwError(() => new Error('offline')));
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(navigate).toHaveBeenCalledWith(['/host', 42, 'subscription']);
    });

    // Without an id to name, the console's root picks the hostel itself.
    it('falls back to the console root when the saved hostel comes back without an id', () => {
      const { vm, hostels, navigate, refreshSession, loadHostels } = render();
      hostels.create.mockReturnValue(of({ id: null }));
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/host']);
      expect(loadHostels).toHaveBeenCalledTimes(1);
      expect(refreshSession).not.toHaveBeenCalled();
    });

    it('stays on the page and surfaces the errors when the save is rejected', () => {
      const { vm, hostels, navigate, loadHostels, refreshSession } = render();
      hostels.create.mockReturnValue(
        throwError(
          (): ApiError => ({
            status: 422,
            code: 'unknown_error',
            message: 'City is invalid',
            serverMessages: ['City is invalid'],
            method: 'POST',
          }),
        ),
      );
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(navigate).not.toHaveBeenCalled();
      expect(loadHostels).not.toHaveBeenCalled();
      expect(refreshSession).not.toHaveBeenCalled();
      expect(vm.draftError()).toBe(true);
      expect(vm.apiErrors()).toEqual(['City is invalid']);
    });

    it('stays on the form when it is incomplete', () => {
      const { vm, hostels, navigate } = render();

      vm.saveAndContinue();

      expect(hostels.create).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(vm.showValidationModal()).toBe(true);
    });
  });

  // The hostel payload has no field for the lead photo; it is its own PUT once the photo is linked.
  describe('lead photo', () => {
    it('marks the starred photo after the save that links it, before leaving', () => {
      const { vm, hostels, navigate } = render();
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledTimes(1);
      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledWith('att-1');
      expect(hostels.create.mock.invocationCallOrder[0]).toBeLessThan(
        hostels.markAttachmentAsPrimary.mock.invocationCallOrder[0],
      );
      expect(hostels.markAttachmentAsPrimary.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0],
      );
    });

    it('marks the starred photo, not the first one, on save & exit', () => {
      const { vm, hostels, navigate } = render();
      vm.draftId.set(7);
      vm.media.set([
        { id: 1, label: 'a.jpg', primary: false, url: 'https://cdn/1', attachmentId: 'att-1' },
        { id: 2, label: 'b.jpg', primary: true, url: 'https://cdn/2', attachmentId: 'att-2' },
      ]);

      vm.saveAndExit();

      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledTimes(1);
      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledWith('att-2');
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('sends no banner_id in the hostel payload', () => {
      const { vm, hostels } = render();
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(hostels.create.mock.calls[0][0]).not.toHaveProperty('banner_id');
    });

    it('does not re-send an unchanged star, but sends a moved one', () => {
      const { vm, hostels } = render();
      vm.draftId.set(7);
      vm.media.set([
        { id: 1, label: 'a.jpg', primary: true, url: 'https://cdn/1', attachmentId: 'att-1' },
        { id: 2, label: 'b.jpg', primary: false, url: 'https://cdn/2', attachmentId: 'att-2' },
      ]);

      vm.saveAndExit();
      vm.saveAndExit();
      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledTimes(1);

      vm.media.update((items) => items.map((m) => ({ ...m, primary: m.id === 2 })));
      vm.saveAndExit();

      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledTimes(2);
      expect(hostels.markAttachmentAsPrimary).toHaveBeenLastCalledWith('att-2');
    });

    it('skips the call when the starred photo has no attachment yet', () => {
      const { vm, hostels, navigate } = render();
      vm.draftId.set(7);
      vm.media.set([{ id: 1, label: 'a.jpg', primary: true, url: 'https://cdn/1' }]);

      vm.saveAndExit();

      expect(hostels.markAttachmentAsPrimary).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('skips the call when the hostel save is rejected, since the photo is not linked', () => {
      const { vm, hostels } = render();
      hostels.create.mockReturnValue(rejectedSave('POST'));
      fillValidForm(vm);

      vm.saveAndContinue();

      expect(hostels.markAttachmentAsPrimary).not.toHaveBeenCalled();
    });

    it('still leaves when marking fails, and retries on the next save', () => {
      const { vm, hostels, navigate } = render();
      hostels.markAttachmentAsPrimary.mockReturnValueOnce(throwError(() => new Error('403')));
      vm.draftId.set(7);
      vm.media.set([
        { id: 1, label: 'a.jpg', primary: true, url: 'https://cdn/1', attachmentId: 'att-1' },
      ]);

      vm.saveAndExit();
      expect(navigate).toHaveBeenCalledWith(['/']);
      expect(vm.draftError()).toBe(false);

      vm.saveAndExit();
      expect(hostels.markAttachmentAsPrimary).toHaveBeenCalledTimes(2);
    });
  });

  describe('logo', () => {
    it('is a link to home', () => {
      const { fixture } = render();
      // `/en`, not `/` — every href carries its language now (see `LocaleLink`).
      const logo = fixture.nativeElement.querySelector(
        'header a[href="/en"]',
      ) as HTMLAnchorElement | null;
      expect(logo).not.toBeNull();

      // The mark is inline SVG in an <i> now, not an <img>, so the accessible name moved from
      // `alt` to `role="img"` + `aria-label`. Still asserted, because it is the only text in
      // this link — without it a screen reader announces the way home as an empty link.
      const mark = logo?.querySelector('i[hhLogo]') as HTMLElement | null;
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute('role')).toBe('img');
      expect(mark?.getAttribute('aria-label')).toBe('HostelHive');
      expect(mark?.querySelector('svg')).not.toBeNull();
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

    it('floors a committed capacity and never drops below one', () => {
      const { vm } = render();
      vm.newRoomType.set('Dormitory');

      vm.setNewRoomCapacity('4.7');
      expect(vm.newRoomCapacity()).toBe(4);

      vm.setNewRoomCapacity('0');
      expect(vm.newRoomCapacity()).toBe(1);
    });

    // A backpacker dorm is routinely 12–20 beds; the old ceiling of 9 truncated it.
    it('accepts a dormitory larger than nine beds', () => {
      const { vm } = render();
      vm.newRoomType.set('Dormitory');

      vm.setNewRoomCapacity('12');
      expect(vm.newRoomCapacity()).toBe(12);

      vm.setNewRoomCapacity('30');
      expect(vm.newRoomCapacity()).toBe(30);
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
        JSON.stringify({
          owner: 'u1',
          newRoomType: 'Quad sharing',
          newRoomCapacity: 1,
          rooms: [],
        }),
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
        'publicOnboarding.savedOnThisDevice',
      );
    });
  });

  describe('draft ownership', () => {
    function fillContactDetails(vm: WizardInternals): void {
      fillValidForm(vm);
      vm.email.set('first-host@example.com');
      vm.phone.set('+923001111111');
      vm.secondaryPhone.set('+923002222222');
    }

    it('opens empty for the next user after the previous host signs out', () => {
      const { vm, hostels, session, remount } = render(user('host-a'));
      fillContactDetails(vm);
      vm.saveAndExit();
      expect(hostels.create).toHaveBeenCalledTimes(1);
      expect(storedDraft()?.['draftId']).toBe(42);

      session.clear();
      TestBed.tick();
      const next = remount(() => session.setSession(user('host-b'), 'tok-b'));

      expect(next.vm.name()).toBe('');
      expect(next.vm.email()).toBe('');
      expect(next.vm.phone()).toBe('');
      expect(next.vm.secondaryPhone()).toBe('');
      expect(next.vm.draftId()).toBeNull();

      fillValidForm(next.vm);
      next.vm.saveAndContinue();

      expect(hostels.create).toHaveBeenCalledTimes(2);
      expect(hostels.update).not.toHaveBeenCalled();
    });

    it('never shows a draft stored by another user, and leaves none of it on disk', () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          owner: 'someone-else',
          draftId: 9,
          name: 'Other Hostel',
          email: 'other@example.com',
          phone: '+923009999999',
          secondaryPhone: '+923008888888',
        }),
      );

      const { vm } = render();
      TestBed.tick();

      expect(vm.name()).toBe('');
      expect(vm.email()).toBe('');
      expect(vm.phone()).toBe('');
      expect(vm.secondaryPhone()).toBe('');
      expect(vm.draftId()).toBeNull();
      const raw = localStorage.getItem(DRAFT_KEY) ?? '';
      expect(raw).not.toContain('Other Hostel');
      expect(raw).not.toContain('other@example.com');
      expect(raw).not.toContain('+923009999999');
      expect(storedDraft()?.['draftId'] ?? null).toBeNull();
    });

    it('does not bring the draft back when the same host signs out and in again', () => {
      const { vm, session, remount } = render();
      fillContactDetails(vm);
      vm.saveAndExit();
      expect(storedDraft()?.['draftId']).toBe(42);

      session.clear();
      TestBed.tick();
      const next = remount(() => session.setSession(user('u1'), 'tok'));

      expect(next.vm.name()).toBe('');
      expect(next.vm.email()).toBe('');
      expect(next.vm.draftId()).toBeNull();
    });

    it('discards a draft saved before drafts had an owner', () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ draftId: 9, name: 'Legacy Hostel', email: 'legacy@example.com' }),
      );

      const { vm } = render();
      TestBed.tick();

      expect(vm.name()).toBe('');
      expect(vm.email()).toBe('');
      expect(vm.draftId()).toBeNull();
      const raw = localStorage.getItem(DRAFT_KEY) ?? '';
      expect(raw).not.toContain('Legacy Hostel');
      expect(raw).not.toContain('legacy@example.com');
      expect(storedDraft()?.['draftId'] ?? null).toBeNull();
    });

    it('removes the draft when the session ends mid-wizard and writes nothing afterwards', () => {
      const { vm, session } = render();
      vm.name.set('Half-typed hostel');
      TestBed.tick();
      expect(storedDraft()?.['name']).toBe('Half-typed hostel');

      session.clear();
      TestBed.tick();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.name.set('Typed after the session ended');
      TestBed.tick();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.saveAndExit();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.confirmLeave();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('restores linked photos for the same host so they are never sent twice', () => {
      const { vm, hostels, remount } = render();
      vm.draftId.set(7);
      vm.media.set([
        { id: 1, label: 'a.jpg', primary: true, url: 'https://cdn/1', attachmentId: 'att-1' },
      ]);
      vm.saveAndExit();
      expect(hostels.update.mock.calls[0][1].attachment_ids).toEqual(['att-1']);

      const next = remount();
      expect(next.vm.draftId()).toBe(7);
      expect(next.vm.media().map((m) => m.attachmentId)).toEqual(['att-1']);

      next.vm.saveAndExit();

      expect(hostels.update).toHaveBeenCalledTimes(2);
      expect(hostels.update.mock.calls[1][0]).toBe(7);
      expect(hostels.update.mock.calls[1][1].attachment_ids).toBeUndefined();
    });
  });

  describe('draft after save & continue', () => {
    it('removes the draft as soon as the hostel is created and never writes it back', () => {
      const { vm, navigate, refreshSession } = render();
      const refreshed = new Subject<{ id: string }>();
      refreshSession.mockReturnValue(refreshed);
      fillValidForm(vm);
      TestBed.tick();
      expect(storedDraft()?.['name']).toBe('Sunrise Boys Hostel');

      vm.saveAndContinue();

      // The session refresh is still pending here, so nothing has navigated yet.
      expect(navigate).not.toHaveBeenCalled();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      TestBed.tick();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.name.set('Edited after saving');
      TestBed.tick();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.saveAndExit();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      vm.confirmLeave();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      refreshed.next({ id: 'u1' });
      refreshed.complete();
      TestBed.tick();

      expect(navigate).toHaveBeenCalledWith(['/host', 42, 'subscription']);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('removes the draft once an existing hostel is updated', () => {
      const { vm, navigate } = render();
      fillValidForm(vm);
      vm.draftId.set(7);
      TestBed.tick();
      expect(storedDraft()?.['draftId']).toBe(7);

      vm.saveAndContinue();

      expect(navigate).toHaveBeenCalledWith(['/host', 7, 'subscription']);
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

      TestBed.tick();
      vm.name.set('Edited after saving');
      TestBed.tick();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('removes the draft even when the session refresh fails', () => {
      const { vm, navigate, refreshSession } = render();
      refreshSession.mockReturnValue(throwError(() => new Error('offline')));
      fillValidForm(vm);
      TestBed.tick();
      expect(storedDraft()).not.toBeNull();

      vm.saveAndContinue();
      TestBed.tick();

      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/host', 42, 'subscription']);
    });

    it('keeps the draft and keeps saving it when creating the hostel is rejected', () => {
      const { vm, hostels } = render();
      hostels.create.mockReturnValue(rejectedSave('POST'));
      fillValidForm(vm);
      TestBed.tick();

      vm.saveAndContinue();
      TestBed.tick();

      expect(vm.draftError()).toBe(true);
      expect(storedDraft()?.['name']).toBe('Sunrise Boys Hostel');
      expect(storedDraft()?.['email']).toBe('host@example.com');

      vm.name.set('Renamed after the error');
      TestBed.tick();
      expect(storedDraft()?.['name']).toBe('Renamed after the error');
    });

    it('keeps the draft and its id when updating the hostel is rejected', () => {
      const { vm, hostels } = render();
      hostels.update.mockReturnValue(rejectedSave('PATCH'));
      fillValidForm(vm);
      vm.draftId.set(7);
      TestBed.tick();

      vm.saveAndContinue();
      TestBed.tick();

      expect(vm.draftError()).toBe(true);
      expect(storedDraft()?.['draftId']).toBe(7);
      expect(storedDraft()?.['name']).toBe('Sunrise Boys Hostel');

      vm.name.set('Renamed after the error');
      TestBed.tick();
      expect(storedDraft()?.['name']).toBe('Renamed after the error');
    });

    it('starts a new listing for the same host after the previous one was saved', () => {
      const { vm, hostels, remount } = render();
      fillValidForm(vm);
      vm.saveAndContinue();
      expect(hostels.create).toHaveBeenCalledTimes(1);
      // Lets the wizard's persist effect run before it goes, as it would ahead of navigation.
      TestBed.tick();

      const next = remount();

      expect(next.vm.draftId()).toBeNull();
      expect(next.vm.name()).toBe('');

      fillValidForm(next.vm);
      next.vm.saveAndContinue();

      expect(hostels.create).toHaveBeenCalledTimes(2);
      expect(hostels.update).not.toHaveBeenCalled();
    });
  });

  describe('draft after save & exit', () => {
    it('keeps the draft with the new id when the exit creates the hostel', () => {
      const { vm } = render();
      fillValidForm(vm);

      vm.saveAndExit();
      TestBed.tick();

      expect(storedDraft()?.['draftId']).toBe(42);
      expect(storedDraft()?.['name']).toBe('Sunrise Boys Hostel');
    });

    it('keeps the draft when the exit updates the hostel', () => {
      const { vm, hostels } = render();
      vm.draftId.set(7);
      vm.name.set('Only a name so far');

      vm.saveAndExit();
      TestBed.tick();

      expect(hostels.update).toHaveBeenCalledTimes(1);
      expect(storedDraft()?.['draftId']).toBe(7);
      expect(storedDraft()?.['name']).toBe('Only a name so far');
    });

    it('keeps the draft when the exit save is rejected', () => {
      const { vm, hostels } = render();
      hostels.update.mockReturnValue(rejectedSave('PATCH'));
      vm.draftId.set(7);
      vm.name.set('Only a name so far');

      vm.saveAndExit();
      TestBed.tick();

      expect(vm.draftError()).toBe(true);
      expect(storedDraft()?.['draftId']).toBe(7);
      expect(storedDraft()?.['name']).toBe('Only a name so far');
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

/**
 * Property type, which the wizard collected from nobody until it was added.
 *
 * `propertyTypes` was already being fetched here and discarded — no control offered it — so
 * every hostel created through onboarding was posted with no `property_type` at all. That is
 * a live public search filter, so the listing existed and simply never matched a type-filtered
 * search, which is the kind of absence nobody reports.
 */
describe('OnboardingWizard — property type', () => {
  // Its own lifecycle: this block sits outside the suite above, so without these every
  // render() here reuses the previous TestBed and the last chosen type leaks into the
  // next assertion — which is how a passing test can be measuring the test before it.
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('offers what the server returned, cased for reading', () => {
    const { vm } = render();

    expect(vm.propertyTypeOptions()).toEqual([
      { value: 'apartment', label: 'Apartment' },
      { value: 'building', label: 'Building' },
    ]);
  });

  it('sends the chosen type when the hostel is created', () => {
    const { vm, hostels } = render();
    fillValidForm(vm);
    vm.setPropertyType('building');

    vm.saveAndExit();

    const [input] = hostels.create.mock.calls[0];
    expect(input.property_type).toBe('building');
  });

  // Omitted, not sent empty. An empty string is a value the backend would have to interpret.
  it('omits the field entirely when nothing was chosen', () => {
    const { vm, hostels } = render();
    fillValidForm(vm);

    vm.saveAndExit();

    const [input] = hostels.create.mock.calls[0];
    expect(input.property_type).toBeUndefined();
  });

  // The guard is the fetched list, not a copy of the enum — so a slug the server never
  // offered cannot reach the payload, whatever hands it over.
  it('refuses a type the server did not offer', () => {
    const { vm } = render();

    vm.setPropertyType('castle');

    expect(vm.propertyType()).toBe('');
  });

  it('keeps the choice in the local draft', () => {
    const { vm } = render();
    vm.name.set('Half-typed hostel');
    vm.setPropertyType('apartment');

    vm.saveAndExit();

    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
    expect(saved.propertyType).toBe('apartment');
  });
});
