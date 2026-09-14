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

  /** Every attachment rejection sent, in order, with the note the host would receive. */
  rejected: { id: string; notes: string }[] = [];
  /** Attachment ids un-rejected — the undo path. */
  unrejected: string[] = [];
  /** Makes the rejection call fail, to check that nothing is published behind it. */
  rejectFails = false;

  markAttachmentAsRejected(id: string, notes: string): Observable<unknown> {
    if (this.rejectFails) return defer(() => Promise.reject(new Error('nope')));
    this.rejected.push({ id, notes });
    return of({});
  }
  markAttachmentAsActive(id: string): Observable<unknown> {
    this.unrejected.push(id);
    return of({});
  }

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
      // A successful approve navigates back to the queue. With no routes registered that
      // navigation rejects, and the rejection surfaces as an unhandled error detached from
      // the test that caused it — green suite, two errors in the log. A catch-all is enough:
      // where it lands is the router's business, that it can land at all is this file's.
      provideRouter([{ path: '**', children: [] }]),
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

/**
 * That a rejection actually leaves the browser.
 *
 * This screen held rejections in a `Map` and nothing else. A moderator could reject a photo,
 * watch the card grey out, press Update, be told the listing saved — and nothing had been
 * sent: `save` wrote the hostel's own fields and `approve` published the listing, neither of
 * them so much as reading the map. The decision died with the page, and the confirm dialog
 * had promised the opposite in as many words: "This photo will be marked as rejected and
 * excluded from the listing."
 *
 * Publishing is where it mattered most. Rejecting a photo and then approving the listing put
 * that photo straight onto the public page — the one outcome the control exists to prevent.
 */
describe('Review · a rejected photo reaches the server', () => {
  /** Complete enough to pass the approve gate, with two photos so one can go. */
  function completeListing(): HostelDetail {
    return emptyListing({
      name: 'Ever Care',
      city: 'Lahore',
      description: 'A clean, quiet hostel a short walk from the university.',
      gender_type: 'boys',
      property_type: 'house',
      primary_phone: '+923001234567',
      latitude: 31.5204,
      longitude: 74.3587,
      billing_frequency: 'month',
      room_types: [
        {
          id: 'rt1',
          name: 'Double sharing',
          capacity: 2,
          price: 10000,
          discounted_price: 0,
          is_discountable: false,
          is_bookable: false,
          occupancy_type: 'shared',
        },
      ],
      attachments: [
        { id: 'a1', url: 'https://cdn.test/a1.jpg', is_primary: true },
        { id: 'a2', url: 'https://cdn.test/a2.jpg' },
      ],
    } as unknown as Partial<HostelDetail>);
  }

  interface Loop {
    requestRemoveById(id: string): void;
    confirmRemove(): void;
    undoRejectById(id: string): void;
    rejectedPhotos(): ReadonlyMap<string, string>;
    dirty(): boolean;
    save(): void;
    approve(): void;
    validationErrors(): string[];
  }

  async function loop(): Promise<Loop> {
    const fixture = await render(detail(completeListing()));
    return fixture.componentInstance as unknown as Loop;
  }

  /** Lets the flush and the write that follows it settle. */
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20)) as Promise<void>;

  function reject(c: Loop, id: string): void {
    c.requestRemoveById(id);
    c.confirmRemove();
  }

  it('the fixture is approvable, so a refusal below means something', async () => {
    expect((await loop()).validationErrors()).toEqual([]);
  });

  it('sends the rejection when the moderator saves', async () => {
    const c = await loop();
    reject(c, 'a2');

    c.save();
    await settle();

    expect(api.rejected.map((r) => r.id)).toEqual(['a2']);
  });

  /** "flagged" is the internal marker; a host reading it learns nothing. */
  it('sends a note a host can read rather than the internal token', async () => {
    const c = await loop();
    reject(c, 'a2');

    c.save();
    await settle();

    expect(api.rejected[0]!.notes).not.toBe('flagged');
    expect(api.rejected[0]!.notes).toMatch(/reject/i);
  });

  it('sends the rejection before it publishes the listing', async () => {
    const c = await loop();
    reject(c, 'a2');

    c.approve();
    await settle();

    expect(api.rejected.map((r) => r.id)).toEqual(['a2']);
    expect(api.markAsActiveCalls).toBe(1);
  });

  /**
   * The ordering is the point, not a detail. A listing published with a photo the moderator
   * has already rejected is the exact harm the control exists to prevent, so a rejection that
   * cannot be recorded has to stop the publish — an unpublished listing is the recoverable
   * half of the two.
   */
  it('does not publish at all when the rejection cannot be recorded', async () => {
    const c = await loop();
    api.rejectFails = true;
    reject(c, 'a2');

    c.approve();
    await settle();

    expect(api.markAsActiveCalls).toBe(0);
  });

  it('does not send the same rejection twice across two saves', async () => {
    const c = await loop();
    reject(c, 'a2');

    c.save();
    await settle();
    c.save();
    await settle();

    expect(api.rejected.length).toBe(1);
  });

  // Once sent, there is nothing left for Update to do about it.
  it('stops counting as an unsaved change once it has been sent', async () => {
    const c = await loop();
    reject(c, 'a2');
    expect(c.dirty()).toBe(true);

    c.save();
    await settle();

    expect(c.dirty()).toBe(false);
  });

  /**
   * The card has to keep reading as rejected after a save. Clearing the map to settle the
   * dirty check would make every photo just rejected look live again until a reload.
   */
  it('keeps showing the photo as rejected after the save', async () => {
    const c = await loop();
    reject(c, 'a2');

    c.save();
    await settle();

    expect([...c.rejectedPhotos().keys()]).toEqual(['a2']);
  });

  /** Undoing something the server holds means telling the server, not forgetting it here. */
  it('un-rejects on the server when undone after a save', async () => {
    const c = await loop();
    reject(c, 'a2');
    c.save();
    await settle();

    c.undoRejectById('a2');
    await settle();

    expect(api.unrejected).toEqual(['a2']);
    expect(c.rejectedPhotos().size).toBe(0);
  });

  /** Undone before it was ever sent, there is nothing to tell the server about. */
  it('says nothing to the server when undone before a save', async () => {
    const c = await loop();
    reject(c, 'a2');
    c.undoRejectById('a2');

    c.save();
    await settle();

    expect(api.rejected).toEqual([]);
    expect(api.unrejected).toEqual([]);
  });

  it('leaves the attachment endpoints alone when nothing was rejected', async () => {
    const c = await loop();

    c.approve();
    await settle();

    expect(api.rejected).toEqual([]);
    expect(api.markAsActiveCalls).toBe(1);
  });
});

/**
 * A rejection the server already holds, read back.
 *
 * Found by checking the live API rather than by any test here, which is the part worth
 * keeping: the previous change made the rejection *persist*, and every test written for it
 * asserted the write. None asserted the read, so none noticed that the screen never looked.
 * Rejecting a photo and coming back showed it sitting there untouched — the moderator's
 * decision was recorded and invisible, and the only thing left to do with it was reject it
 * again.
 *
 * Two traps sit either side of the fix. Seed too little and the grid lies; seed carelessly
 * and a freshly loaded page reports itself as having unsaved changes, whereupon Update sends
 * rejections the server already has.
 */
describe('Review · rejections the server already holds', () => {
  /**
   * The component's half of the fix. Whether `decision` arrives set correctly is the mapper's
   * half, and is asserted in `moderation-api.spec.ts` against the wire shape — the two meet at
   * `ReviewDetail.photos`, so each is tested on its own side of it.
   */
  async function loadWith(decisions: ('pending' | 'rejected')[]) {
    const photos = decisions.map((decision, i) => ({
      id: `a${i + 1}`,
      url: `https://cdn.test/a${i + 1}.jpg`,
      decision,
      primary: i === 0,
    }));
    // Complete on purpose. `save` returns early on a validation error, so on a half-filled
    // listing "nothing was sent" is true however the code behaves — the assertion below would
    // hold against a version that re-sends every rejection it reads. It did, until this
    // fixture was filled in: seeding the map but not what had been sent left that test green.
    const base = detail(
      emptyListing({
        name: 'Ever Care',
        city: 'Lahore',
        description: 'A clean, quiet hostel a short walk from the university.',
        gender_type: 'boys',
        property_type: 'house',
        primary_phone: '+923001234567',
        latitude: 31.5204,
        longitude: 74.3587,
        billing_frequency: 'month',
        room_types: [
          {
            id: 'rt1',
            name: 'Double sharing',
            capacity: 2,
            price: 10000,
            discounted_price: 0,
            is_discountable: false,
            is_bookable: false,
            occupancy_type: 'shared',
          },
        ],
        attachments: photos.map((p) => ({ id: p.id, url: p.url })),
      } as unknown as Partial<HostelDetail>),
    );
    const fixture = await render({ ...base, photos } as unknown as ReviewDetail);
    return fixture.componentInstance as unknown as {
      rejectedPhotos(): ReadonlyMap<string, string>;
      dirty(): boolean;
      save(): void;
    };
  }

  it('shows a photo the server has rejected as rejected', async () => {
    const c = await loadWith(['pending', 'rejected', 'pending']);

    expect([...c.rejectedPhotos().keys()]).toEqual(['a2']);
  });

  it('leaves a listing whose photos are all live with nothing rejected', async () => {
    const c = await loadWith(['pending', 'pending']);

    expect(c.rejectedPhotos().size).toBe(0);
  });

  /**
   * The first trap. A rejection already on the server is not an unsaved change, and a page
   * that reports itself dirty the moment it loads offers an Update the moderator never asked
   * for.
   */
  it('does not report a freshly loaded page as having unsaved changes', async () => {
    const c = await loadWith(['pending', 'rejected']);

    expect(c.dirty()).toBe(false);
  });

  /** The second trap: Update must not send again what the server already holds. */
  it('does not re-send a rejection it only read', async () => {
    const c = await loadWith(['pending', 'rejected']);

    c.save();
    await new Promise((r) => setTimeout(r, 20));

    expect(api.rejected).toEqual([]);
  });

  /** The badge reads "Rejected · {reason}", so the seeded value is copy, not a token. */
  it('labels it as an earlier decision rather than with an internal token', async () => {
    const c = await loadWith(['rejected']);

    expect(c.rejectedPhotos().get('a1')).not.toBe('flagged');
    expect(c.rejectedPhotos().get('a1')).toMatch(/earlier/i);
  });
});
