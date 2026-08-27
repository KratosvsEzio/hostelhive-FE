import { provideHttpClient } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, defer, of } from 'rxjs';
import {
  HostelDetail,
  HostelFormOptions,
  OfferCategory,
  ReviewDetail,
} from '@hostelhive/data-access';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { HostelsApi, ModerationApi, OffersApi, ImageUploadService, HostOpsApi } from '@services';
import { Review } from './review';

const OPTIONS: HostelFormOptions = {
  genderTypes: [{ id: 1, slug: 'boys', name: 'Boys' }],
  propertyTypes: [{ id: 3, slug: 'house', name: 'House' }],
  billingFrequencyTypes: [{ id: 0, slug: 'month', name: 'Month' }],
  occupancyTypes: [{ id: 0, slug: 'shared', name: 'Shared' }],
  attachmentLabels: [],
};

/** A listing with nothing filled in — the case Approve & publish has to refuse. */
function emptyListing(over: Partial<HostelDetail> = {}): HostelDetail {
  return {
    id: 1,
    name: '',
    description: '',
    gender_type: '',
    property_type: '',
    city: '',
    state: '',
    country: '',
    area: '',
    latitude: null,
    longitude: null,
    primary_phone: '',
    attachments: [],
    banner: [],
    hostel_offers: [],
    room_types: [],
    rooms: [],
    ...over,
  } as unknown as HostelDetail;
}

function detail(hostel: HostelDetail): ReviewDetail {
  return {
    hostel,
    id: '1',
    name: hostel.name,
    kindLabel: 'House',
    genderLabel: 'Boys',
    propertyType: hostel.property_type,
    genderType: hostel.gender_type,
    description: hostel.description ?? '',
    landmarks: '',
    photos: [],
    host: 'Mia Amir',
    city: hostel.city ?? '',
    submittedLabel: '27 Aug 2026',
    daysInQueueLabel: '0 hrs',
    daysInQueueTone: 'ok',
    paymentLabel: 'Verified',
    audit: [],
    hostId: 7,
    hostEmail: 'mia@example.com',
    hostPhone: '+923094149089',
    hostActive: true,
    hostMemberSince: null,
    statusLabel: 'Onboarding',
    dispositionLabel: 'In Review',
    address: null,
    lat: hostel.latitude,
    lng: hostel.longitude,
    country: '',
    state: '',
    area: '',
    address1: '',
    amenities: [],
    offerCatalog: [] as OfferCategory[],
    selectedOfferSlugs: [],
  } as unknown as ReviewDetail;
}

class ModerationApiStub {
  detail: ReviewDetail | null = null;
  fail = false;
  markAsActiveCalls = 0;

  /** Deferred to a microtask: a synchronous source makes `toSignal` write mid-render. */
  getById(): Observable<ReviewDetail> {
    return defer(() =>
      this.fail || !this.detail
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(this.detail),
    );
  }
  formOptions(): Observable<HostelFormOptions> {
    return defer(() => Promise.resolve(OPTIONS));
  }
  markAsActive(): Observable<unknown> {
    this.markAsActiveCalls++;
    return of({});
  }
  audit(): Observable<unknown[]> {
    return of([]);
  }
  logAudit(): Observable<unknown> {
    return of({});
  }
}

let api: ModerationApiStub;

async function render(d: ReviewDetail | null, fail = false): Promise<ComponentFixture<Review>> {
  TestBed.resetTestingModule();
  api = new ModerationApiStub();
  api.detail = d;
  api.fail = fail;
  TestBed.configureTestingModule({
    imports: [Review],
    providers: [
      provideI18nTesting(),
      provideRouter([]),
      provideHttpClient(),
      provideNoopAnimations(),
      { provide: ModerationApi, useValue: api },
      {
        provide: HostelsApi,
        useValue: {
          formOptions: () => defer(() => Promise.resolve(OPTIONS)),
          update: () => defer(() => Promise.resolve({})),
        },
      },
      {
        provide: OffersApi,
        useValue: { categories: () => defer(() => Promise.resolve([] as OfferCategory[])) },
      },
      { provide: ImageUploadService, useValue: {} },
      { provide: HostOpsApi, useValue: {} },
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', '1']])) } },
    ],
  });
  const fixture = TestBed.createComponent(Review);
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r, 20));
  fixture.detectChanges();
  return fixture;
}

/**
 * The gate on Approve & publish.
 *
 * The rules moved into the shared hostel form when this screen stopped hand-rolling its own,
 * so what is checked here is that the *gate* still holds: the button is in the page header,
 * and publishing an unfinished listing is not an undo-able mistake.
 */
describe('Review · approve & publish', () => {
  function approve(fixture: ComponentFixture<Review>): void {
    (fixture.componentInstance as unknown as { approve(): void }).approve();
  }

  function errorsOn(fixture: ComponentFixture<Review>): string[] {
    return (
      fixture.componentInstance as unknown as { validationErrors(): string[] }
    ).validationErrors();
  }

  it('refuses an empty listing and says why', async () => {
    const fixture = await render(detail(emptyListing()));

    expect(errorsOn(fixture).length).toBeGreaterThan(0);

    approve(fixture);
    expect(api.markAsActiveCalls).toBe(0);
  });

  it('names the missing pieces rather than failing silently', async () => {
    const fixture = await render(detail(emptyListing()));
    const joined = errorsOn(fixture).join(' | ').toLowerCase();

    expect(joined).toContain('name');
    expect(joined).toContain('description');
    expect(joined).toContain('photo');
  });

  /**
   * The hole this test exists for.
   *
   * Approve & publish renders in the page header, outside the branch that draws the listing —
   * so it is on screen while the fetch is in flight and again after it fails. The checklist
   * reads the form, and in those two states there is no form. Answering "nothing is wrong"
   * would publish a listing nobody has looked at.
   */
  it('refuses when the listing failed to load and there is no form to check', async () => {
    const fixture = await render(null, true);

    expect(errorsOn(fixture).length).toBeGreaterThan(0);

    approve(fixture);
    expect(api.markAsActiveCalls).toBe(0);
  });
});

/**
 * Rejecting a photo: ask, confirm, undo.
 *
 * A rejection is not an edit to the hostel — it is a message to its host — so it stays with
 * this screen rather than the shared form. The form asks (`photoRejectRequested`), a modal
 * confirms, and the grid's own Undo control takes it back. Nothing may happen on the ask
 * alone: a moderator who opens the dialog and changes their mind has not rejected anything.
 */
describe('Review · rejecting a photo', () => {
  interface Loop {
    requestRemoveById(id: string): void;
    confirmRemove(): void;
    undoRejectById(id: string): void;
    removeConfirmPhotoId: { (): string | null; set(v: string | null): void };
    rejectedPhotos(): ReadonlyMap<string, string>;
    dirty(): boolean;
  }

  async function loop(): Promise<Loop> {
    const fixture = await render(detail(emptyListing({ name: 'Ever Care' })));
    return fixture.componentInstance as unknown as Loop;
  }

  it('asks before it rejects', async () => {
    const c = await loop();

    c.requestRemoveById('a2');

    expect(c.removeConfirmPhotoId()).toBe('a2');
    // Nothing has happened yet — the dialog is a question, not the answer.
    expect(c.rejectedPhotos().size).toBe(0);
  });

  it('rejects once confirmed, and closes the dialog', async () => {
    const c = await loop();

    c.requestRemoveById('a2');
    c.confirmRemove();

    expect([...c.rejectedPhotos().keys()]).toEqual(['a2']);
    expect(c.removeConfirmPhotoId()).toBeNull();
  });

  it('rejects nothing when the dialog is dismissed', async () => {
    const c = await loop();

    c.requestRemoveById('a2');
    c.removeConfirmPhotoId.set(null);

    expect(c.rejectedPhotos().size).toBe(0);
  });

  it('takes it back on undo', async () => {
    const c = await loop();

    c.requestRemoveById('a2');
    c.confirmRemove();
    c.undoRejectById('a2');

    expect(c.rejectedPhotos().size).toBe(0);
  });

  it('leaves the other photos alone', async () => {
    const c = await loop();

    c.requestRemoveById('a1');
    c.confirmRemove();
    c.requestRemoveById('a2');
    c.confirmRemove();
    c.undoRejectById('a1');

    expect([...c.rejectedPhotos().keys()]).toEqual(['a2']);
  });

  // A rejection has to enable Update, or the moderator's decision is stranded: the form is
  // untouched, so nothing else on the page would report the page as changed.
  it('counts as an unsaved change', async () => {
    const c = await loop();
    expect(c.dirty()).toBe(false);

    c.requestRemoveById('a2');
    c.confirmRemove();

    expect(c.dirty()).toBe(true);
  });
});
