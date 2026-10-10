import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Listing } from '@hostelhive/data-access';
import { LocaleStore } from '@core/i18n/locale-store';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { FavouritesApi } from '@services/favourites-api';
import { FavoritesStore } from '@util/favorites-store';
import { AccountFavorites } from './favorites';

function listing(id: string, name: string): Listing {
  return {
    id,
    slug: `${id}-hostel`,
    name,
    area: 'Gulberg',
    city: 'Lahore',
    accommodationType: 'girls',
    verified: true,
    sharing: [],
    amenities: [],
    priceFrom: 20000,
    currency: 'PKR',
    images: [],
    lat: 31.5,
    lng: 74.3,
  } as Listing;
}

const A = listing('a', 'Alpha House');
const B = listing('b', 'Bravo Lodge');
const C = listing('c', 'Cedar Rooms');

describe('AccountFavorites removal', () => {
  let fixture: ComponentFixture<AccountFavorites>;
  let outcome: Subject<void>;
  let unsave: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // jsdom has no matchMedia, which each listing card reads in its constructor.
    (window as unknown as Record<string, unknown>)['matchMedia'] = () => ({
      matches: true,
    });
    outcome = new Subject<void>();
    unsave = vi.fn(() => outcome.asObservable());

    TestBed.configureTestingModule({
      imports: [AccountFavorites],
      providers: [
        provideRouter([]),
        provideI18nTesting(),
        { provide: FavouritesApi, useValue: { listFavourites: () => of([A, B, C]) } },
        {
          provide: FavoritesStore,
          useValue: { unsave, isFavorite: () => true, items: signal([A, B, C]) },
        },
        {
          provide: LocaleStore,
          useValue: { ready: signal(false), active: signal('en') },
        },
      ],
    });
    fixture = TestBed.createComponent(AccountFavorites);
    await settle();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['matchMedia'];
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rowNames(): string[] {
    return Array.from(el().querySelectorAll('hh-listing-card h3')).map(
      (h) => h.textContent?.trim() ?? '',
    );
  }

  function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!found) throw new Error(`no button reading "${text}"`);
    return found;
  }

  function modal(): HTMLElement | null {
    return el().querySelector('hh-confirm-modal');
  }

  async function openPrompt(index: number): Promise<HTMLElement> {
    const unfavorite = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.textContent?.trim() === 'userFavorites.unfavorite',
    );
    unfavorite[index].click();
    await settle();
    const dialog = modal();
    if (!dialog) throw new Error('confirmation did not open');
    return dialog;
  }

  async function confirmRemoving(index: number): Promise<void> {
    buttonByText(await openPrompt(index), 'Remove').click();
    await settle();
  }

  it('drops the confirmed row at once and keeps it gone once the server agrees', async () => {
    expect(rowNames()).toEqual(['Alpha House', 'Bravo Lodge', 'Cedar Rooms']);

    await confirmRemoving(1);

    expect(unsave).toHaveBeenCalledTimes(1);
    expect(unsave).toHaveBeenCalledWith(B);
    expect(rowNames()).toEqual(['Alpha House', 'Cedar Rooms']);
    expect(modal()).toBeNull();

    outcome.next();
    outcome.complete();
    await settle();

    expect(rowNames()).toEqual(['Alpha House', 'Cedar Rooms']);
  });

  it('puts the row back in its original place when the server refuses', async () => {
    await confirmRemoving(1);
    expect(rowNames()).toEqual(['Alpha House', 'Cedar Rooms']);

    outcome.error(new Error('offline'));
    await settle();

    expect(rowNames()).toEqual(['Alpha House', 'Bravo Lodge', 'Cedar Rooms']);
  });

  it('puts the row back when the store refuses the unsave at once', async () => {
    unsave.mockImplementationOnce(() => throwError(() => new Error('signed out')));

    await confirmRemoving(1);

    expect(unsave).toHaveBeenCalledWith(B);
    expect(modal()).toBeNull();
    expect(rowNames()).toEqual(['Alpha House', 'Bravo Lodge', 'Cedar Rooms']);
  });

  it('removes nothing when the confirmation is cancelled', async () => {
    const dialog = await openPrompt(1);

    buttonByText(dialog, 'common.cancel').click();
    await settle();

    expect(unsave).not.toHaveBeenCalled();
    expect(modal()).toBeNull();
    expect(rowNames()).toEqual(['Alpha House', 'Bravo Lodge', 'Cedar Rooms']);
  });
});
