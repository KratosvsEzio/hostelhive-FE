import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AttachmentLabel, AttachmentPage, ModeratorAttachment } from '@hostelhive/data-access';
import { FilterChipOption } from '@hostelhive/ui';
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
  setStatus(slug: string): void;
  setLabel(value: string): void;
  labelTabs(): FilterChipOption[];
  activeLabel(): string;
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
  /** The label filter sent with each read, in the same order as `reads`. */
  let labelReads: (string | undefined)[];
  let labelCatalogue: () => Observable<AttachmentLabel[]>;
  /** What the route says on entry — a deep link into a filtered queue sets these. */
  let queryParams: Record<string, string>;

  beforeEach(async () => {
    reads = [];
    approved = [];
    rejected = [];
    labelReads = [];
    listPage = (p) => (p === 1 ? page([1, 2, 3], 2) : page([4, 5, 6], null));
    approveResult = () => of(undefined);
    rejectResult = () => of(undefined);
    listFails = false;
    labelCatalogue = () =>
      of([
        { id: 11, name: 'Kitchen' },
        { id: 12, name: 'Rooftop' },
      ]);
    queryParams = {};

    await TestBed.configureTestingModule({
      imports: [Media],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParams() { return queryParams; } } } },
        {
          provide: ModerationApi,
          useValue: {
            attachmentLabels: () => labelCatalogue(),
            attachments: (p: number, status?: string, label?: string) => {
              reads.push(`${p}:${status ?? 'all'}`);
              labelReads.push(label);
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

  /**
   * Narrowing the queue to one photo label.
   *
   * The filtering has to happen on the server. The queue is paged ten at a time, so sifting
   * what is in hand would answer "the Kitchen photos" with the Kitchen photos of page one and
   * call every other page empty.
   */
  describe('label filter', () => {
    /** A fresh queue, as if the moderator had just landed on a URL carrying `params`. */
    function recreate(params: Record<string, string>): void {
      queryParams = params;
      reads.length = 0;
      labelReads.length = 0;
      fixture = TestBed.createComponent(Media);
      fixture.detectChanges();
    }

    it('asks for everything until a label is picked', () => {
      expect(labelReads).toEqual([undefined]);
    });

    it('sends the label the moderator picked', () => {
      labelReads.length = 0;

      media().setLabel('Kitchen');

      expect(labelReads).toEqual(['Kitchen']);
    });

    it('asks for the unlabelled photos by the search layer own sentinel', () => {
      // `null` is how the search layer is told "this field is absent" — the one way to ask
      // for the photos nobody has filed.
      labelReads.length = 0;

      media().setLabel('null');

      expect(labelReads).toEqual(['null']);
    });

    it('starts the narrowed queue at the first page', () => {
      media().loadMore();
      reads.length = 0;

      media().setLabel('Kitchen');

      // Not page 2 as well: the moderator is looking at a different list now, and the depth
      // they had reached in the old one says nothing about this one.
      expect(reads).toEqual(['1:all']);
    });

    it('keeps the label when it re-reads after a decision', () => {
      media().setLabel('Kitchen');
      labelReads.length = 0;

      media().setOne(attachment(1), 'approved');

      // A refresh that dropped the filter would refill the grid with photos the moderator
      // had just filtered away.
      expect(labelReads).toEqual(['Kitchen']);
    });

    it('keeps the label alongside a status', () => {
      media().setLabel('Kitchen');
      reads.length = 0;
      labelReads.length = 0;

      media().setStatus('rejected');

      expect(reads).toEqual(['1:rejected']);
      expect(labelReads).toEqual(['Kitchen']);
    });

    it('does not re-read for the label already showing', () => {
      media().setLabel('Kitchen');
      reads.length = 0;

      media().setLabel('Kitchen');

      expect(reads).toEqual([]);
    });

    it('opens on the label the URL names', () => {
      recreate({ label: 'Rooftop' });

      expect(media().activeLabel()).toBe('Rooftop');
      expect(labelReads).toEqual(['Rooftop']);
    });

    it('offers every label, with all and unlabelled around them', () => {
      expect(media().labelTabs().map((t) => t.value)).toEqual([
        '',
        'Kitchen',
        'Rooftop',
        'null',
      ]);
    });

    /**
     * Labels are something a tenant defines, so a tenant that has defined none has nothing to
     * filter by — and a row reading "All labels · Unlabelled" would be two chips that both
     * mean everything.
     */
    it('has no row to show when the tenant has defined no labels', () => {
      labelCatalogue = () => of([]);
      recreate({});

      expect(media().labelTabs()).toEqual([]);
    });

    it('still shows the queue when the catalogue will not load', () => {
      labelCatalogue = () => throwError(() => new Error('offline'));
      recreate({});

      // The filter is a convenience; the photos are the job.
      expect(media().labelTabs()).toEqual([]);
      expect(ids()).toEqual([1, 2, 3]);
      expect(media().loadStatus()).toBe('ready');
    });
  });
});
