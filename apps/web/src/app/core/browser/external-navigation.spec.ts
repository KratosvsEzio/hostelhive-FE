import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ExternalNavigation } from './external-navigation';

describe('ExternalNavigation', () => {
  function setUp(defaultView: unknown): ExternalNavigation {
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView } }],
    });
    return TestBed.inject(ExternalNavigation);
  }

  it('hands the url to the window location as given', () => {
    const assign = vi.fn();
    const nav = setUp({ location: { assign } });

    nav.assign('https://getsafepay.com/embedded/?tracker=t1');

    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(
      'https://getsafepay.com/embedded/?tracker=t1',
    );
  });

  // The server renders with a document that has no window behind it.
  it('does nothing when there is no window', () => {
    const nav = setUp(null);

    expect(() => nav.assign('https://getsafepay.com/')).not.toThrow();
  });
});
