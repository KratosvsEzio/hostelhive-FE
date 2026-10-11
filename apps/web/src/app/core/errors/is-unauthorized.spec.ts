import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from '@hostelhive/data-access';
import { isUnauthorized } from './is-unauthorized';

function apiError(status: number): ApiError {
  return { status, code: 'unknown_error', message: 'failed' };
}

describe('isUnauthorized', () => {
  it('is true for a normalised API error with status 401', () => {
    expect(isUnauthorized(apiError(401))).toBe(true);
  });

  it('is true for a raw HttpErrorResponse with status 401', () => {
    const err = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      url: 'https://api.test/api/users/current',
    });
    expect(isUnauthorized(err)).toBe(true);
  });

  it('treats a network failure (status 0) as not a rejection', () => {
    expect(isUnauthorized({ status: 0 })).toBe(false);
  });

  it.each([
    ['403', { status: 403 }],
    ['500', { status: 500 }],
    ["the string '401'", { status: '401' }],
  ])('is false for status %s', (_label, err) => {
    expect(isUnauthorized(err)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Unauthorized'],
    ['a number', 401],
    ['an object without a status', {}],
  ])('is false for %s', (_label, err) => {
    expect(isUnauthorized(err)).toBe(false);
  });
});
