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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPicker],
      // The template resolves its copy through transloco, so the component cannot be created
      // without a translation backend — without this the whole spec fails on NG0201 rather
      // than on anything it is actually asserting.
      providers: [BookingBasket, provideI18nTesting()],
    }).compileComponents();
  });

  it('groups rooms by kind under their own headings', () => {
    render([PRIVATE, DORM]);
    expect(text()).toContain('Private rooms');
    expect(text()).toContain('Shared rooms');
    expect(text()).toContain('Deluxe 6 Bed Private Ensuite');
    expect(text()).toContain('Deluxe 12 Bed Mixed Dorm');
  });

  // A missing group must say so. An absent heading is indistinguishable from a failed load.
  it('says so when a hostel has none of one kind', () => {
    render([DORM]);
    expect(text()).toContain('No private rooms available');
    expect(text()).not.toContain('No shared rooms available');
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

  it('hides rooms the host has not opened to booking', () => {
    render([DORM, { ...PRIVATE, bookable: false }]);
    expect(text()).not.toContain('Deluxe 6 Bed Private Ensuite');
    expect(text()).toContain('No private rooms available');
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
});
