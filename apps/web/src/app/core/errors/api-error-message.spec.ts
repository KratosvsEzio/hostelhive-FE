import { ApiError } from '@hostelhive/data-access';
import { extractServerMessages, toToastCopy } from './api-error-message';

const SYNTHETIC =
  'Http failure response for http://192.168.1.5:3000/api/host/hostels/1/rooms: 404 Not Found';

describe('extractServerMessages', () => {
  const cases: ReadonlyArray<{
    name: string;
    body: unknown;
    expected: readonly string[];
  }> = [
    {
      name: 'canonical array of strings',
      body: { success: false, errors: ["Full name can't be blank", 'Room must exist'] },
      expected: ["Full name can't be blank", 'Room must exist'],
    },
    {
      name: 'singular CanCan error string',
      body: { success: false, error: 'You are not authorized to perform this action.' },
      expected: ['You are not authorized to perform this action.'],
    },
    {
      name: 'errors as a plain string',
      body: { success: false, errors: 'Something went wrong' },
      expected: ['Something went wrong'],
    },
    {
      name: 'errors as a field-to-messages object',
      body: { success: false, errors: { email: ['is invalid'], name: ['is too short'] } },
      expected: ['is invalid', 'is too short'],
    },
    {
      name: 'non-envelope object without errors/error',
      body: { message: 'nope' },
      expected: [],
    },
    { name: 'routing-404 HTML string body', body: '<!DOCTYPE html><h1>Not Found</h1>', expected: [] },
    { name: 'null body', body: null, expected: [] },
    { name: 'undefined body', body: undefined, expected: [] },
    { name: 'blob body', body: new Blob(['x']), expected: [] },
    { name: 'empty errors array', body: { errors: [] }, expected: [] },
    { name: 'errors array with blank entries', body: { errors: ['', '  '] }, expected: [] },
  ];

  for (const c of cases) {
    it(`handles ${c.name}`, () => {
      expect(extractServerMessages(c.body)).toEqual(c.expected);
    });
  }

  it('never throws on a non-array errors shape', () => {
    expect(() => extractServerMessages({ errors: 42 })).not.toThrow();
    expect(extractServerMessages({ errors: 42 })).toEqual([]);
  });
});

describe('toToastCopy', () => {
  function error(partial: Partial<ApiError>): ApiError {
    return { status: 400, code: 'unknown_error', message: SYNTHETIC, ...partial };
  }

  it('echoes a 422 envelope message under an owned save title', () => {
    const copy = toToastCopy(
      error({ status: 422, serverMessages: ["Full name can't be blank", 'Room must exist'] }),
    );
    expect(copy.title).toBe("Couldn't save changes");
    expect(copy.message).toContain("Full name can't be blank");
    expect(copy.message).toContain('Room must exist');
  });

  it('titles a failed read as a load failure, not a save failure', () => {
    const copy = toToastCopy(
      error({
        status: 400,
        method: 'GET',
        serverMessages: ['You need to subscribe to avail the services'],
      }),
    );
    expect(copy.title).toBe("Couldn't load");
    expect(copy.message).toBe('You need to subscribe to avail the services');
  });

  it('keeps the save title for a failed write', () => {
    const copy = toToastCopy(
      error({ status: 400, method: 'POST', serverMessages: ['Room must exist'] }),
    );
    expect(copy.title).toBe("Couldn't save changes");
  });

  it('falls back to the save title when no method is known', () => {
    expect(toToastCopy(error({ status: 400, serverMessages: ['x'] })).title).toBe(
      "Couldn't save changes",
    );
  });

  it('still prefers the status-specific title over the method title', () => {
    expect(toToastCopy(error({ status: 403, method: 'GET' })).title).toBe('Not allowed');
  });

  it('echoes a 403 message under the not-allowed title', () => {
    const copy = toToastCopy(
      error({ status: 403, serverMessages: ['You are not authorized to perform this action.'] }),
    );
    expect(copy.title).toBe('Not allowed');
    expect(copy.message).toBe('You are not authorized to perform this action.');
  });

  it('uses generic copy for a non-envelope 404', () => {
    const copy = toToastCopy(error({ status: 404, serverMessages: undefined }));
    expect(copy.title).toBe("Couldn't load");
    expect(copy.message).not.toContain('http');
  });

  it('uses generic copy for 5xx and never echoes the body', () => {
    const copy = toToastCopy(error({ status: 500, serverMessages: ['secret debug trace'] }));
    expect(copy.title).toBe('Something went wrong');
    expect(copy.message).not.toContain('secret debug trace');
  });

  it('uses connection copy for status 0', () => {
    const copy = toToastCopy(error({ status: 0, code: 'network_error' }));
    expect(copy.title).toBe('Connection problem');
  });

  it('truncates an overlong server message with an ellipsis', () => {
    const long = 'x'.repeat(500);
    const copy = toToastCopy(error({ status: 422, serverMessages: [long] }));
    expect(copy.message.length).toBeLessThanOrEqual(201);
    expect(copy.message.endsWith('…')).toBe(true);
  });

  it('never leaks the synthetic HttpErrorResponse.message', () => {
    for (const status of [0, 400, 401, 403, 404, 422, 500, 503]) {
      const copy = toToastCopy(error({ status }));
      expect(copy.title).not.toContain('Http failure response');
      expect(copy.message).not.toContain('Http failure response');
      expect(copy.message).not.toContain('192.168');
    }
  });
});
