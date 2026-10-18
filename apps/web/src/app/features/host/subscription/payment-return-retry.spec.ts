import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, throwError } from 'rxjs';
import type { ApiError } from '@hostelhive/data-access';
import { PaymentReturnRetry, RetryHandlers } from './payment-return-retry';
import { SafepayCheckout } from './safepay-checkout';

function refusal(message: string): ApiError {
  return {
    status: 422,
    code: 'unknown_error',
    message: '',
    serverMessages: [message],
  };
}

describe('PaymentReturnRetry', () => {
  let start: ReturnType<typeof vi.fn<() => Observable<void>>>;
  let handlers: RetryHandlers;

  function setUp(): PaymentReturnRetry {
    TestBed.configureTestingModule({
      providers: [
        PaymentReturnRetry,
        {
          provide: SafepayCheckout,
          useValue: {
            start,
            returnHostel: () => 'nHelLt',
            restored$: EMPTY,
          },
        },
      ],
    });
    return TestBed.inject(PaymentReturnRetry);
  }

  beforeEach(() => {
    start = vi.fn<() => Observable<void>>(() => EMPTY);
    handlers = { expired: vi.fn(), settled: vi.fn(), notFound: vi.fn() };
  });

  it('starts the same invoice again from the hostel it was paid from', () => {
    const retry = setUp();

    retry.start('inv1', handlers);

    expect(start).toHaveBeenCalledWith('inv1', 'nHelLt');
    expect(retry.state().starting).toBe(true);
  });

  it.each([
    'Your card was declined: Insufficient funds',
    'A card payment for invoice HH-2026-000012 is already in progress',
  ])('shows %j under the button and lets the payer try again', (message) => {
    start.mockReturnValue(throwError(() => refusal(message)));
    const retry = setUp();

    retry.start('inv1', handlers);

    expect(retry.state()).toEqual({
      starting: false,
      available: true,
      note: { message },
    });
    expect(handlers.expired).not.toHaveBeenCalled();
    expect(handlers.settled).not.toHaveBeenCalled();
    expect(handlers.notFound).not.toHaveBeenCalled();

    start.mockReturnValue(EMPTY);
    retry.start('inv1', handlers);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("hides Try again once card payments aren't available for the currency", () => {
    const message = "Card payments aren't available for USD invoices";
    start.mockReturnValue(throwError(() => refusal(message)));
    const retry = setUp();

    retry.start('inv1', handlers);

    expect(retry.state()).toEqual({
      starting: false,
      available: false,
      note: { message },
    });
  });
});
