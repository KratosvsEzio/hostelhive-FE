import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AttachmentPage, ModeratorAttachment } from '@hostelhive/data-access';
import { ModerationApi } from '@services';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { Media } from './media';

function attachment(id: number): ModeratorAttachment {
  return { id, key: 'attachments', url: `https://example.test/${id}.jpg` };
}

function page(ids: number[], nextPage: number | null, totalCount = 62): AttachmentPage {
  return {
    items: ids.map(attachment),
    nextPage,
    totalCount,
    possibleStatuses: [
      { slug: 'rejected', name: 'Rejected' },
      { slug: 'pending', name: 'Pending' },
    ],
  };
}

/** The component's members are `protected`; the spec drives them through this shape. */
interface MediaInternals {
  setOne(a: ModeratorAttachment, decision: 'approved' | 'rejected'): void;
  approveSelected(): void;
  rejectAll(): void;
  confirmReject(): void;
  rejectNote: { set(value: string): void };
  toggleSelect(id: string): void;
  loadMore(): void;
  pending(): ModeratorAttachment[];
  totalCount(): number;
  loadStatus(): string;
}

describe('Media queue', () => {
  let fixture: ComponentFixture<Media>;
  /** Every list read, in order, as `page:status`. */
  let reads: string[];
  let approved: string[];
  let rejected: { id: string; notes: string }[];
  let listPage: (page: number) => AttachmentPage;
  let approveResult: () => Observable<void>;
  let rejectResult: () => Observable<void>;
  /** Makes the next list read fail the way a dropped request does. */
  let listFails: boolean;

  beforeEach(async () => {
    reads = [];
    approved = [];
    rejected = [];
    listPage = (p) => (p === 1 ? page([1, 2, 3], 2) : page([4, 5, 6], null));
    approveResult = () => of(undefined);
    rejectResult = () => of(undefined);
    listFails = false;

    await TestBed.configureTestingModule({
      imports: [Media],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
        {
          provide: ModerationApi,
          useValue: {
            attachments: (p: number, status?: string) => {
              reads.push(`${p}:${status ?? 'all'}`);
              return listFails ? throwError(() => new Error('offline')) : of(listPage(p));
            },
            markAttachmentAsActive: (id: string) => {
              approved.push(id);
              return approveResult();
            },
            markAttachmentAsRejected: (id: string, notes: string) => {
              rejected.push({ id, notes });
              return rejectResult();
            },
          },
        },
      ],
    })
      // The queue's own markup is not what this is about, and the dashboard shell would come
      // with it.
      .overrideComponent(Media, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(Media);
    fixture.detectChanges();
  });

  function media(): MediaInternals {
    return fixture.componentInstance as unknown as MediaInternals;
  }

  function ids(): number[] {
    return media().pending().map((a) => Number(a.id));
  }

  it('re-reads the queue after an approval', () => {
    expect(reads).toEqual(['1:all']);

    media().setOne(attachment(1), 'approved');

    expect(approved).toEqual(['1']);
    expect(reads).toEqual(['1:all', '1:all']);
  });

  it('never blanks the page to do it', () => {
    // The refresh must not go through the loading state — the grid would drop to skeletons
    // for a wait the moderator did not ask for.
    media().setOne(attachment(1), 'approved');

    expect(media().loadStatus()).toBe('ready');
  });

  it('takes the fresh count from the server', () => {
    listPage = (p) => (p === 1 ? page([2, 3], null, 61) : page([], null, 61));

    media().setOne(attachment(1), 'approved');

    expect(media().totalCount()).toBe(61);
  });

  it('leaves the approved photo decided, however the server answers', () => {
    // The queue renders what is undecided and has no notion of an approved card, so a list
    // that still carries the photo must not put it back in front of the moderator.
    listPage = () => page([1, 2, 3], null);

    media().setOne(attachment(1), 'approved');

    expect(ids()).toEqual([2, 3]);
  });

  it('puts back every page the moderator had loaded', () => {
    media().loadMore();
    expect(ids()).toEqual([1, 2, 3, 4, 5, 6]);

    reads.length = 0;
    media().setOne(attachment(1), 'approved');

    // Both pages, not just the first — a queue that snapped back to page one on each
    // approval could not be worked past the first screenful.
    expect(reads).toEqual(['1:all', '2:all']);
    expect(ids()).toEqual([2, 3, 4, 5, 6]);
  });

  it('de-duplicates items that shifted between pages while it read them', () => {
    media().loadMore();
    reads.length = 0;
    // The list got shorter, so what was on page 2 comes back on page 1 as well. Two cards
    // with one id is a duplicate-key error in the grid.
    listPage = (p) => (p === 1 ? page([2, 3, 4], 2) : page([4, 5, 6], null));

    media().setOne(attachment(1), 'approved');

    expect(ids()).toEqual([2, 3, 4, 5, 6]);
  });

  it('re-reads once for a bulk approval, not once per photo', () => {
    media().toggleSelect('1');
    media().toggleSelect('2');
    reads.length = 0;

    media().approveSelected();

    expect(approved).toEqual(['1', '2']);
    expect(reads).toEqual(['1:all']);
  });

  it('re-reads even when part of a bulk approval fails', () => {
    let call = 0;
    approveResult = () => (++call === 1 ? throwError(() => new Error('nope')) : of(undefined));
    media().toggleSelect('1');
    media().toggleSelect('2');
    reads.length = 0;

    media().approveSelected();

    // One failure does not make the other approval imaginary — the list still moved.
    expect(reads).toEqual(['1:all']);
  });

  /** Rejection goes through a modal: pick the photos, write the reason, confirm. */
  function reject(a: ModeratorAttachment, note = 'Blurry'): void {
    media().setOne(a, 'rejected');
    media().rejectNote.set(note);
    media().confirmReject();
  }

  it('re-reads the queue after a rejection', () => {
    reads.length = 0;

    reject(attachment(1));

    expect(rejected).toEqual([{ id: '1', notes: 'Blurry' }]);
    expect(reads).toEqual(['1:all']);
  });

  it('re-reads once for a bulk rejection, not once per photo', () => {
    media().toggleSelect('1');
    media().toggleSelect('2');
    media().rejectAll();
    media().rejectNote.set('Wrong room');
    reads.length = 0;

    media().confirmReject();

    expect(rejected.map((r) => r.id)).toEqual(['1', '2']);
    expect(reads).toEqual(['1:all']);
  });

  it('leaves the rejected photo decided, however the server answers', () => {
    listPage = () => page([1, 2, 3], null);

    reject(attachment(1));

    expect(ids()).toEqual([2, 3]);
  });

  it('re-reads even when part of a bulk rejection fails', () => {
    let call = 0;
    rejectResult = () => (++call === 1 ? throwError(() => new Error('nope')) : of(undefined));
    media().toggleSelect('1');
    media().toggleSelect('2');
    media().rejectAll();
    media().rejectNote.set('Wrong room');
    reads.length = 0;

    media().confirmReject();

    expect(reads).toEqual(['1:all']);
  });

  it('keeps what is on screen when the refresh itself fails', () => {
    listFails = true;

    media().setOne(attachment(1), 'approved');

    // The decision still stands; a failed refresh is not the moderator's problem to solve,
    // and the queue does not drop into its error state over one the moderator never asked for.
    expect(ids()).toEqual([2, 3]);
    expect(media().loadStatus()).toBe('ready');
  });

  it('recovers on the next approval after a refresh fails', () => {
    listFails = true;
    media().setOne(attachment(1), 'approved');
    listFails = false;
    listPage = () => page([3], null, 60);

    media().setOne(attachment(2), 'approved');

    // The failed refresh must release its guard, or the queue never re-reads again.
    expect(ids()).toEqual([3]);
    expect(media().totalCount()).toBe(60);
  });
});
