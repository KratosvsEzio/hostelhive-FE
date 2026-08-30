import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { By } from '@angular/platform-browser';
import { BookingBasket } from './booking-basket';
import { RoomPicker } from './room-picker';
import { RoomOffer } from './room-offer';

const PRIVATE: RoomOffer = {
  id: 'p1',
  title: 'Deluxe 6 Bed Private Ensuite',
  kind: 'private',
  capacity: 6,
  actualPrice: 48_183.82,
  discountedPrice: 36_137.86,
  images: [],
  bookable: true,
  available: 2,
};

const DORM: RoomOffer = {
  id: 's1',
  title: 'Deluxe 12 Bed Mixed Dorm',
  kind: 'shared',
  capacity: 12,
  actualPrice: 3_770.58,
  discountedPrice: 2_827.94,
  images: [],
  bookable: true,
  available: 7,
};

const CHEAPER_DORM: RoomOffer = {
  ...DORM,
  id: 's2',
  title: 'Standard 8 Bed Dorm',
  actualPrice: 2_400,
  discountedPrice: undefined,
  available: 4,
};

/** The backend is not built yet, so these render against the contract rather than an API. */
describe('RoomPicker', () => {
  let fixture: ComponentFixture<RoomPicker>;
  let basket: BookingBasket;

  function render(offers: RoomOffer[]): void {
    fixture = TestBed.createComponent(RoomPicker);
    fixture.componentRef.setInput('offers', offers);
    basket = fixture.debugElement.injector.get(BookingBasket);
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Room titles in the order they are rendered. */
  function titles(): string[] {
    return fixture.debugElement
      .queryAll(By.css('article h3'))
      .map((d) => (d.nativeElement as HTMLElement).textContent?.trim() ?? '');
  }

  /**
   * The kind badges, by exact text.
   *
   * Not a page-text search: "Deluxe 6 Bed Private Ensuite" contains "Private", so a
   * `toContain('Private')` would pass with no badge rendered at all.
   */
  function kindBadges(): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('article span'))
      .map((el) => el.textContent?.trim() ?? '')
      .filter((t) => t === 'Private' || t === 'Shared');
  }

  /** The Add / stepper controls currently on the page. */
  function addControls(): unknown[] {
    return fixture.debugElement.queryAll(By.css('button[hh-button]'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPicker],
      // The template resolves its copy through transloco, so the component cannot be created
      // without a translation backend — without this the whole spec fails on NG0201 rather
      // than on anything it is actually asserting.
      providers: [BookingBasket, provideI18nTesting()],
    }).compileComponents();
  });

  /**
   * One list rather than two labelled blocks — the kind moved onto each card.
   *
   * Order is what is left of the grouping, so it is the thing to pin: private rooms lead
   * whatever order the server sends them in.
   */
  it('lists every bookable room, private ones first', () => {
    render([DORM, PRIVATE, CHEAPER_DORM]);

    expect(titles()).toEqual([
      'Deluxe 6 Bed Private Ensuite',
      'Deluxe 12 Bed Mixed Dorm',
      'Standard 8 Bed Dorm',
    ]);
  });

  it('no longer heads the rooms with per-kind titles', () => {
    render([PRIVATE, DORM]);

    expect(text()).not.toContain('Private rooms');
    expect(text()).not.toContain('Shared rooms');
  });

  // Without the headings this badge is the only thing telling a whole room from a bed.
  it('names each room’s kind on the card itself', () => {
    render([PRIVATE, DORM]);

    expect(kindBadges()).toEqual(['Private', 'Shared']);
  });

  /**
   * The per-kind empty states are gone with the headings — a hostel with only dorms just
   * shows its dorms. A hostel with no room types at all still speaks, because an empty
   * section is indistinguishable from one that failed to load.
   */
  it('says so when the hostel has no rooms at all', () => {
    render([]);

    expect(text()).toContain('publicBooking.noRoomsListed');
  });

  it('stays quiet when a hostel simply has none of one kind', () => {
    render([DORM]);

    expect(text()).toContain('Deluxe 12 Bed Mixed Dorm');
    expect(text()).not.toContain('publicBooking.noRoomsListed');
  });

  // The unit is the whole point of the split — a bare "2" means rooms on one row and beds on
  // the next.
  it('labels the unit per row, not per page', () => {
    render([PRIVATE, DORM]);
    expect(text()).toContain('Prices are per room');
    expect(text()).toContain('Prices are per bed');
  });

  it('shows the derived discount badge, not a stored one', () => {
    render([PRIVATE]);
    expect(text()).toContain('25%');
  });

  /**
   * A room the host has not opened to online booking.
   *
   * It used to be dropped from the list. That answered "can I reserve this right now" by
   * removing the evidence for "does this hostel have a room that suits me" — and a host who
   * had switched nothing on appeared to run a hostel with no rooms. The flag belongs to the
   * control, not to the card.
   */
  describe('a room not open to booking', () => {
    const CLOSED = { ...PRIVATE, bookable: false };

    it('is still listed with its price', () => {
      render([DORM, CLOSED]);

      expect(titles()).toEqual(['Deluxe 6 Bed Private Ensuite', 'Deluxe 12 Bed Mixed Dorm']);
      expect(text()).toContain('36,137.86');
    });

    it('carries no Add, while its neighbours keep theirs', () => {
      render([DORM, CLOSED]);

      expect(addControls().length).toBe(1);
    });

    // "2 left" is a reason to hurry toward something that is not on offer.
    it('drops the scarcity chip', () => {
      render([CLOSED]);

      expect(text()).not.toContain('common.nLeft');
    });

    it('keeps the chip on a room that is open', () => {
      render([PRIVATE]);

      expect(text()).toContain('common.nLeft');
    });
  });

  /**
   * Monthly listings.
   *
   * These had a separate, plainer section of their own — the same room types off the same
   * payload, without photos, descriptions or discounts — because a tenancy has no checkout.
   * They now share this one, which drops the booking controls rather than the rooms.
   *
   * Every room type on a monthly hostel comes back `is_bookable: false`, so these also pin
   * that the flag cannot empty the section.
   */
  describe('let by the month', () => {
    const CLOSED_PRIVATE = { ...PRIVATE, bookable: false };
    const CLOSED_DORM = { ...DORM, bookable: false };

    function renderMonthly(offers: RoomOffer[]): void {
      fixture = TestBed.createComponent(RoomPicker);
      fixture.componentRef.setInput('offers', offers);
      fixture.componentRef.setInput('period', 'monthly');
      basket = fixture.debugElement.injector.get(BookingBasket);
      fixture.detectChanges();
    }

    it('lists every room even though none is open to booking', () => {
      renderMonthly([CLOSED_PRIVATE, CLOSED_DORM]);

      expect(titles()).toEqual(['Deluxe 6 Bed Private Ensuite', 'Deluxe 12 Bed Mixed Dorm']);
      expect(text()).toContain('36,137.86');
    });

    it('offers nothing to add', () => {
      renderMonthly([CLOSED_PRIVATE, CLOSED_DORM]);

      expect(addControls().length).toBe(0);
    });

    // One kind in practice, so the badge would repeat itself down the whole list.
    it('drops the kind badge', () => {
      renderMonthly([PRIVATE, DORM]);

      expect(kindBadges()).toEqual([]);
    });

    it('drops the scarcity chip', () => {
      renderMonthly([PRIVATE]);

      expect(text()).not.toContain('common.nLeft');
    });

    // One section, one heading, whichever way the hostel bills. The separate card is gone.
    it('sits under the same heading a nightly listing uses', () => {
      renderMonthly([PRIVATE]);

      expect(text()).toContain('listing.roomsAmpPricing');
    });
  });

  // Scoped to the group: the cheapest bed always undercuts the cheapest private room, so a
  // hostel-wide badge would only ever land on a dorm.
  it('awards the best-price badge within each group', () => {
    render([DORM, CHEAPER_DORM]);
    expect(text()).toContain('Best bed price');
  });

  it('adds to the basket in the row’s own unit', () => {
    render([PRIVATE, DORM]);
    const addButtons = fixture.debugElement.queryAll(By.css('button[hh-button]'));
    addButtons[0].nativeElement.click();
    fixture.detectChanges();

    expect(basket.lines().length).toBe(1);
    expect(basket.lines()[0].kind).toBe('private');
    expect(text()).toContain('1 room');
  });

  it('captures the discounted price onto the line', () => {
    render([PRIVATE]);
    fixture.debugElement.query(By.css('button[hh-button]')).nativeElement.click();
    fixture.detectChanges();

    expect(basket.lines()[0].unitPrice).toBe(36_137.86);
    expect(basket.lines()[0].actualPrice).toBe(48_183.82);
  });

  // The stepper's ceiling is availability, so an unhonourable basket cannot be assembled at
  // all — this is the control's bound rather than a message after the fact.
  it('will not step past what is available', () => {
    render([PRIVATE]);
    const picker = fixture.componentInstance as unknown as {
      step(o: RoomOffer, by: number): void;
    };
    picker.step(PRIVATE, 1);
    picker.step(PRIVATE, 1);
    picker.step(PRIVATE, 1); // PRIVATE has 2 available
    fixture.detectChanges();

    expect(basket.quantityOf('p1')).toBe(2);
  });

  // Each row carousels on its own. One shared index would page every room in the list at
  // once, which is the bug this keyed map exists to prevent.
  it('pages each room’s photos independently', () => {
    const a: RoomOffer = { ...DORM, id: 'a', images: ['1.jpg', '2.jpg', '3.jpg'] };
    const b: RoomOffer = { ...CHEAPER_DORM, id: 'b', images: ['4.jpg', '5.jpg'] };
    render([a, b]);
    const picker = fixture.componentInstance as unknown as {
      stepPhoto(o: RoomOffer, by: number, e: Event): void;
      photoIndex(o: RoomOffer): number;
    };

    picker.stepPhoto(a, 1, new Event('click'));
    fixture.detectChanges();

    expect(picker.photoIndex(a)).toBe(1);
    expect(picker.photoIndex(b)).toBe(0);
  });

  it('will not page past either end', () => {
    const a: RoomOffer = { ...DORM, id: 'a', images: ['1.jpg', '2.jpg'] };
    render([a]);
    const picker = fixture.componentInstance as unknown as {
      stepPhoto(o: RoomOffer, by: number, e: Event): void;
      photoIndex(o: RoomOffer): number;
    };

    picker.stepPhoto(a, -1, new Event('click'));
    expect(picker.photoIndex(a)).toBe(0);

    picker.stepPhoto(a, 1, new Event('click'));
    picker.stepPhoto(a, 1, new Event('click'));
    expect(picker.photoIndex(a)).toBe(1);
  });

  // The cap is a product rule, and the payload is host-supplied.
  it('shows at most three photos however many the room carries', () => {
    const a: RoomOffer = {
      ...DORM,
      id: 'a',
      images: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'],
    };
    render([a]);
    const picker = fixture.componentInstance as unknown as {
      photosOf(o: RoomOffer): readonly string[];
    };

    expect(picker.photosOf(a).length).toBe(3);
  });

  it('holds the photo column open for a room with no photos', () => {
    render([{ ...DORM, images: [] }]);
    expect(fixture.debugElement.query(By.css('.ti-photo'))).toBeTruthy();
  });

  it('removes the line when stepped down to zero', () => {
    render([DORM]);
    const picker = fixture.componentInstance as unknown as {
      step(o: RoomOffer, by: number): void;
    };
    picker.step(DORM, 1);
    picker.step(DORM, -1);
    fixture.detectChanges();

    expect(basket.lines().length).toBe(0);
  });

  /**
   * The description control.
   *
   * It used to expand the row in place and flip to "Show less", and it rendered for any
   * description at all — so a room described as "Sea view room" offered a toggle that
   * revealed nothing and then offered to un-reveal it. These pin both halves of the fix:
   * the control only appears when the clamp is hiding something, and it opens a dialog
   * rather than growing the row.
   */
  describe('room description', () => {
    const LONG =
      'A bright corner room on the second floor with its own balcony over the courtyard, ' +
      'an attached bath, a study desk, and a wardrobe wide enough for two.';

    function showMoreButton(): HTMLButtonElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('button.text-brand-600');
    }

    function dialog(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    }

    it('offers no control for a description short enough to read in place', () => {
      render([{ ...PRIVATE, description: 'Sea view room' }]);
      expect(text()).toContain('Sea view room');
      expect(showMoreButton()).toBeNull();
    });

    it('offers no control when there is no description at all', () => {
      render([{ ...PRIVATE, description: undefined }]);
      expect(showMoreButton()).toBeNull();
    });

    // The key, not the English — provideI18nTesting resolves keys to themselves on purpose.
    // It is the stronger assertion here anyway: there is one label because there is one
    // state, where the old control flipped between a "more" and a "less" of its own.
    it('offers Show more once the clamp starts hiding text', () => {
      render([{ ...PRIVATE, description: LONG }]);
      expect(showMoreButton()?.textContent?.trim()).toBe('listing.showMore');
    });

    it('opens the description in a dialog headed by the room', () => {
      render([{ ...PRIVATE, description: LONG }]);
      expect(dialog()).toBeNull();

      showMoreButton()!.click();
      fixture.detectChanges();

      const d = dialog();
      expect(d).not.toBeNull();
      expect(d!.textContent).toContain('Deluxe 6 Bed Private Ensuite');
      expect(d!.textContent).toContain('wardrobe wide enough for two');
    });

    // Growing the row would push every room below it down the page, which is the reason
    // this is a dialog at all — so the list must be exactly where it was.
    it('leaves the row clamped while the dialog is open', () => {
      render([{ ...PRIVATE, description: LONG }, DORM]);
      showMoreButton()!.click();
      fixture.detectChanges();

      const p = (fixture.nativeElement as HTMLElement).querySelector('article p');
      expect(p?.classList.contains('line-clamp-2')).toBe(true);
      expect(text()).toContain('Deluxe 12 Bed Mixed Dorm');
    });

    it('closes on the close button', () => {
      render([{ ...PRIVATE, description: LONG }]);
      showMoreButton()!.click();
      fixture.detectChanges();

      const close = dialog()!.querySelector('button')!;
      close.click();
      fixture.detectChanges();

      expect(dialog()).toBeNull();
    });

    // One room at a time: opening the dorm while the private row is open must not stack
    // two dialogs, and the one on screen must be the room that was asked for.
    it('shows only the room whose control was pressed', () => {
      render([
        { ...PRIVATE, description: LONG },
        { ...DORM, description: LONG + ' Bunks are steel-framed.' },
      ]);
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'button.text-brand-600',
      );
      expect(buttons.length).toBe(2);

      (buttons[1] as HTMLButtonElement).click();
      fixture.detectChanges();

      const all = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="dialog"]');
      expect(all.length).toBe(1);
      expect(dialog()!.textContent).toContain('Deluxe 12 Bed Mixed Dorm');
      expect(dialog()!.textContent).toContain('Bunks are steel-framed');
    });
  });
});
