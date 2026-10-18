import type { ApiError } from '@hostelhive/data-access';
import { AdminBillingError, adminBillingError } from './admin-billing-errors';

function apiError(over: Partial<ApiError> = {}): ApiError {
  return {
    status: 422,
    code: 'unknown_error',
    message: 'Http failure response for https://api.test/api/admin/payments',
    ...over,
  };
}

describe('adminBillingError', () => {
  const cases: [string, unknown, AdminBillingError][] = [
    [
      'a value that is not an API error',
      new Error('boom'),
      {
        kind: 'generic',
        status: 0,
        code: '',
        message: null,
        key: 'adminBilling.errors.generic',
      },
    ],
    [
      'a network failure',
      apiError({ status: 0, code: 'network_error' }),
      {
        kind: 'network',
        status: 0,
        code: 'network_error',
        message: null,
        key: 'adminBilling.errors.network',
      },
    ],
    [
      'a 403, ignoring what the server said',
      apiError({ status: 403, serverMessages: ['You are not an admin'] }),
      {
        kind: 'forbidden',
        status: 403,
        code: 'unknown_error',
        message: null,
        key: 'adminBilling.errors.forbidden',
      },
    ],
    [
      'a 404',
      apiError({ status: 404, serverMessages: ['Not Found'] }),
      {
        kind: 'notFound',
        status: 404,
        code: 'unknown_error',
        message: null,
        key: 'adminBilling.errors.notFound',
      },
    ],
    [
      'a 422 with a message',
      apiError({
        status: 422,
        serverMessages: [
          'Only a payment awaiting verification can be verified',
          'second',
        ],
      }),
      {
        kind: 'server',
        status: 422,
        code: 'unknown_error',
        message: 'Only a payment awaiting verification can be verified',
        key: 'adminBilling.errors.generic',
      },
    ],
    [
      'a 400 with a message',
      apiError({
        status: 400,
        serverMessages: ['Months must be between 1 and 24'],
      }),
      {
        kind: 'server',
        status: 400,
        code: 'unknown_error',
        message: 'Months must be between 1 and 24',
        key: 'adminBilling.errors.generic',
      },
    ],
    [
      'a 422 without messages',
      apiError({ status: 422 }),
      {
        kind: 'generic',
        status: 422,
        code: 'unknown_error',
        message: null,
        key: 'adminBilling.errors.generic',
      },
    ],
    [
      'a 400 whose first message is blank',
      apiError({ status: 400, serverMessages: ['   '] }),
      {
        kind: 'generic',
        status: 400,
        code: 'unknown_error',
        message: null,
        key: 'adminBilling.errors.generic',
      },
    ],
    [
      'a 500, even with a message',
      apiError({ status: 500, serverMessages: ['Internal error'] }),
      {
        kind: 'generic',
        status: 500,
        code: 'unknown_error',
        message: null,
        key: 'adminBilling.errors.generic',
      },
    ],
  ];

  it.each(cases)('maps %s', (_label, err, expected) => {
    expect(adminBillingError(err)).toEqual(expected);
  });

  it('keeps the server message exactly as sent', () => {
    const text =
      '  Invoice HH-2026-000123 has a bank transfer waiting for verification ';
    const out = adminBillingError(
      apiError({ status: 422, serverMessages: [text] }),
    );

    expect(out.message).toBe(text);
  });

  it('carries the backend code through', () => {
    const out = adminBillingError(
      apiError({ status: 422, code: 'billing_error' }),
    );

    expect(out.code).toBe('billing_error');
  });

  it('reads null and undefined as generic', () => {
    expect(adminBillingError(null).kind).toBe('generic');
    expect(adminBillingError(undefined).kind).toBe('generic');
  });
});
