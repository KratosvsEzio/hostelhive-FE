import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SessionStore, SessionUser } from '@app/core/auth/session-store';
import {
  CRM_REQUIRED_CODE,
  CRM_REQUIRED_MESSAGE,
  HOST_ACCESS_TTL_MS,
  HostAccessEvents,
  classifyHostAccess,
  hostAccessTarget,
  isCrmRequired,
  isPermissionRefusal,
} from './host-access';

const BASE = 'https://api.test';
const SUBSCRIBE = 'You need to subscribe to avail the services';

describe('classifyHostAccess', () => {
  const hostel = `${BASE}/api/host/hostels/Xk9pQ`;

  it('reads a 400 "need to subscribe" as inactive', () => {
    expect(
      classifyHostAccess(`${hostel}/rooms`, { status: 400, serverMessages: [SUBSCRIBE] }),
    ).toEqual({ hostelId: 'Xk9pQ', kind: 'inactive' });
  });

  it('matches the subscribe message case-insensitively', () => {
    expect(
      classifyHostAccess(hostel, { status: 400, serverMessages: ['YOU NEED TO SUBSCRIBE'] }),
    ).toEqual({ hostelId: 'Xk9pQ', kind: 'inactive' });
  });

  it('ignores a 400 with any other message', () => {
    expect(
      classifyHostAccess(hostel, { status: 400, serverMessages: ['Name is invalid'] }),
    ).toBeNull();
  });

  it('reads a 403 carrying the crm_required code as crmRequired', () => {
    expect(
      classifyHostAccess(`${hostel}/bookings?page=2`, {
        status: 403,
        code: CRM_REQUIRED_CODE,
        serverMessages: [CRM_REQUIRED_MESSAGE],
      }),
    ).toEqual({ hostelId: 'Xk9pQ', kind: 'crmRequired' });
  });

  it('falls back to the CRM message when the 403 body has no code', () => {
    expect(
      classifyHostAccess(`${hostel}/tenants`, {
        status: 403,
        serverMessages: [CRM_REQUIRED_MESSAGE],
      }),
    ).toEqual({ hostelId: 'Xk9pQ', kind: 'crmRequired' });
  });

  it('reads the code alone when the 403 body has no messages', () => {
    expect(
      classifyHostAccess(hostel, { status: 403, code: CRM_REQUIRED_CODE }),
    ).toEqual({ hostelId: 'Xk9pQ', kind: 'crmRequired' });
  });

  it('ignores any other 403', () => {
    expect(
      classifyHostAccess(hostel, { status: 403, serverMessages: ['You are not authorized.'] }),
    ).toBeNull();
  });

  it('ignores the subscribe message on a status other than 400', () => {
    expect(
      classifyHostAccess(hostel, { status: 403, serverMessages: [SUBSCRIBE] }),
    ).toBeNull();
    expect(
      classifyHostAccess(hostel, { status: 500, serverMessages: [SUBSCRIBE] }),
    ).toBeNull();
  });

  it('ignores the CRM code on a status other than 403', () => {
    expect(
      classifyHostAccess(hostel, { status: 400, code: CRM_REQUIRED_CODE }),
    ).toBeNull();
  });

  it.each([
    `${BASE}/api/host/hostels`,
    `${BASE}/api/host/hostels/`,
    `${BASE}/api/host/hostels?page=1`,
    `${BASE}/api/moderator/hostels/Xk9pQ`,
    `${BASE}/public/hostels/Xk9pQ`,
    `${BASE}/api/host/hostelsX/Xk9pQ`,
  ])('ignores a URL that is not one host hostel: %s', (url) => {
    expect(classifyHostAccess(url, { status: 400, serverMessages: [SUBSCRIBE] })).toBeNull();
  });

  it.each([
    [`${BASE}/api/host/hostels/Ab12`, 'Ab12'],
    [`${BASE}/api/host/hostels/Ab12?x=1`, 'Ab12'],
    [`${BASE}/api/host/hostels/Ab12#frag`, 'Ab12'],
    [`${BASE}/api/host/hostels/00042/rooms`, '00042'],
  ])('captures the hostel id exactly as written in %s', (url, id) => {
    expect(
      classifyHostAccess(url, { status: 400, serverMessages: [SUBSCRIBE] })?.hostelId,
    ).toBe(id);
  });
});

describe('isCrmRequired', () => {
  const CANCAN = 'You are not authorized to access this page.';

  it.each<{ why: string; err: unknown }>([
    {
      why: 'the code and the message both come back',
      err: { status: 403, code: CRM_REQUIRED_CODE, serverMessages: [CRM_REQUIRED_MESSAGE] },
    },
    { why: 'only the code comes back', err: { status: 403, code: CRM_REQUIRED_CODE } },
    {
      why: 'the code comes back beside a message that says something else',
      err: { status: 403, code: CRM_REQUIRED_CODE, serverMessages: [CANCAN] },
    },
    {
      why: 'the code comes back with an empty list of messages',
      err: { status: 403, code: CRM_REQUIRED_CODE, serverMessages: [] },
    },
  ])('is true for a 403 when $why', ({ err }) => {
    expect(isCrmRequired(err)).toBe(true);
  });

  it.each<{ why: string; err: unknown }>([
    { why: 'only the message comes back', err: { status: 403, serverMessages: [CRM_REQUIRED_MESSAGE] } },
    {
      why: 'the message comes back under the fallback code',
      err: { status: 403, code: 'unknown_error', serverMessages: [CRM_REQUIRED_MESSAGE] },
    },
    {
      why: 'the message comes first among others',
      err: { status: 403, serverMessages: [CRM_REQUIRED_MESSAGE, CANCAN] },
    },
    {
      why: 'the message comes last among others',
      err: { status: 403, serverMessages: [CANCAN, CRM_REQUIRED_MESSAGE] },
    },
  ])('is true for a 403 when $why', ({ err }) => {
    expect(isCrmRequired(err)).toBe(true);
  });

  it.each<{ why: string; err: unknown }>([
    {
      why: 'it is a refusal of the user, under the fallback code',
      err: { status: 403, code: 'unknown_error', serverMessages: [CANCAN] },
    },
    {
      why: 'it carries a code of the server that is not the plan one',
      err: { status: 403, code: 'forbidden', serverMessages: ['Forbidden'] },
    },
    { why: 'it carries a code of the server and no message', err: { status: 403, code: 'forbidden' } },
    { why: 'it is a bare status', err: { status: 403 } },
    { why: 'it has an empty list of messages', err: { status: 403, serverMessages: [] } },
    { why: 'it has an empty code', err: { status: 403, code: '' } },
  ])('is false for a 403 when $why', ({ err }) => {
    expect(isCrmRequired(err)).toBe(false);
  });

  describe.each([0, 400, 401, 404, 422, 500])('on a %i', (status) => {
    it.each<{ why: string; extra: object }>([
      { why: 'the plan code comes back', extra: { code: CRM_REQUIRED_CODE } },
      { why: 'the plan message comes back', extra: { serverMessages: [CRM_REQUIRED_MESSAGE] } },
      {
        why: 'the plan code and message both come back',
        extra: { code: CRM_REQUIRED_CODE, serverMessages: [CRM_REQUIRED_MESSAGE] },
      },
    ])('is false even when $why', ({ extra }) => {
      expect(isCrmRequired({ status, ...extra })).toBe(false);
    });
  });

  it.each<{ why: string; err: unknown }>([
    { why: 'the rejection is null', err: null },
    { why: 'the rejection is undefined', err: undefined },
    { why: 'the rejection is a string', err: CRM_REQUIRED_MESSAGE },
    { why: 'the rejection is a number', err: 403 },
    { why: 'the rejection is a plain error', err: new Error(CRM_REQUIRED_MESSAGE) },
    { why: 'the rejection is empty', err: {} },
    { why: 'the status is a string', err: { status: '403', code: CRM_REQUIRED_CODE } },
    {
      why: 'the messages are one string, not a list',
      err: { status: 403, serverMessages: CRM_REQUIRED_MESSAGE },
    },
    { why: 'the code is not a string', err: { status: 403, code: 42 } },
  ])('is false and does not throw when $why', ({ err }) => {
    expect(() => isCrmRequired(err)).not.toThrow();
    expect(isCrmRequired(err)).toBe(false);
  });

  it('never reads the message', () => {
    expect(isCrmRequired({ status: 403, message: CRM_REQUIRED_MESSAGE })).toBe(false);
  });
});

describe('isPermissionRefusal', () => {
  const CANCAN = 'You are not authorized to access this page.';

  it.each<{ why: string; err: unknown }>([
    {
      why: 'it carries the fallback code, as the interceptor sends a refusal of the user',
      err: { status: 403, code: 'unknown_error', serverMessages: [CANCAN] },
    },
    { why: 'it has no code', err: { status: 403, serverMessages: [CANCAN] } },
    { why: 'its code is empty', err: { status: 403, code: '', serverMessages: [CANCAN] } },
    { why: 'its code is not a string', err: { status: 403, code: 42 } },
    { why: 'its code is null', err: { status: 403, code: null } },
    { why: 'it is a bare status', err: { status: 403 } },
    { why: 'it has an empty list of messages', err: { status: 403, serverMessages: [] } },
  ])('is true for a 403 when $why', ({ err }) => {
    expect(isPermissionRefusal(err)).toBe(true);
  });

  it.each<{ why: string; err: unknown }>([
    {
      why: "it carries the rate limiter's code",
      err: { status: 403, code: 'forbidden', serverMessages: ['Forbidden'] },
    },
    {
      why: 'it carries that code beside the unauthorized text',
      err: { status: 403, code: 'forbidden', serverMessages: [CANCAN] },
    },
    { why: 'it carries that code and no message', err: { status: 403, code: 'forbidden' } },
    {
      why: 'it carries another code of the server',
      err: { status: 403, code: 'ip_blocked', serverMessages: ['Forbidden'] },
    },
    {
      why: 'it carries that other code beside the unauthorized text',
      err: { status: 403, code: 'ip_blocked', serverMessages: [CANCAN] },
    },
    { why: 'it carries that other code and no message', err: { status: 403, code: 'ip_blocked' } },
  ])('is false for a 403 when $why', ({ err }) => {
    expect(isPermissionRefusal(err)).toBe(false);
  });

  it.each<{ why: string; err: unknown }>([
    {
      why: 'the code and the message both come back',
      err: { status: 403, code: CRM_REQUIRED_CODE, serverMessages: [CRM_REQUIRED_MESSAGE] },
    },
    { why: 'only the code comes back', err: { status: 403, code: CRM_REQUIRED_CODE } },
    {
      why: 'the code comes back beside the unauthorized text',
      err: { status: 403, code: CRM_REQUIRED_CODE, serverMessages: [CANCAN] },
    },
    { why: 'only the message comes back', err: { status: 403, serverMessages: [CRM_REQUIRED_MESSAGE] } },
    {
      why: 'the message comes back under the fallback code',
      err: { status: 403, code: 'unknown_error', serverMessages: [CRM_REQUIRED_MESSAGE] },
    },
    {
      why: 'the message comes first among others',
      err: { status: 403, serverMessages: [CRM_REQUIRED_MESSAGE, CANCAN] },
    },
    {
      why: 'the message comes last among others',
      err: { status: 403, serverMessages: [CANCAN, CRM_REQUIRED_MESSAGE] },
    },
  ])('is false for a 403 when the plan lacks CRM and $why', ({ err }) => {
    expect(isPermissionRefusal(err)).toBe(false);
  });

  it.each<{ why: string; body: unknown }>([
    { why: 'the singular error', body: { success: false, error: CANCAN } },
    { why: 'an errors list', body: { success: false, errors: [CANCAN] } },
    { why: 'no body', body: null },
    { why: 'a body that is text', body: 'Forbidden' },
    { why: 'a body carrying the fallback code', body: { code: 'unknown_error' } },
  ])('is true for a raw 403 response with $why', ({ body }) => {
    expect(isPermissionRefusal(new HttpErrorResponse({ status: 403, error: body }))).toBe(true);
  });

  it.each<{ why: string; body: unknown }>([
    { why: "the rate limiter's code", body: { code: 'forbidden', errors: ['Forbidden'] } },
    { why: 'the plan code', body: { code: CRM_REQUIRED_CODE, errors: [CRM_REQUIRED_MESSAGE] } },
  ])('is false for a raw 403 response carrying $why', ({ body }) => {
    expect(isPermissionRefusal(new HttpErrorResponse({ status: 403, error: body }))).toBe(false);
  });

  describe.each([0, 400, 401, 402, 404, 422, 500])('on a %i', (status) => {
    it.each<{ why: string; err: unknown }>([
      { why: 'it is a bare status', err: { status } },
      {
        why: 'it carries the fallback code and the unauthorized text',
        err: { status, code: 'unknown_error', serverMessages: [CANCAN] },
      },
      {
        why: 'a raw response carries the unauthorized body',
        err: new HttpErrorResponse({ status, error: { success: false, error: CANCAN } }),
      },
    ])('is false even when $why', ({ err }) => {
      expect(isPermissionRefusal(err)).toBe(false);
    });
  });

  it.each<{ why: string; err: unknown }>([
    { why: 'the rejection is null', err: null },
    { why: 'the rejection is undefined', err: undefined },
    { why: 'the rejection is a string', err: CANCAN },
    { why: 'the rejection is a number', err: 403 },
    { why: 'the rejection is a plain error', err: new Error(CANCAN) },
    { why: 'the rejection is empty', err: {} },
    { why: 'the status is a string', err: { status: '403', code: 'unknown_error' } },
  ])('is false and does not throw when $why', ({ err }) => {
    expect(() => isPermissionRefusal(err)).not.toThrow();
    expect(isPermissionRefusal(err)).toBe(false);
  });

  it('never reads the message', () => {
    expect(isPermissionRefusal({ status: 403, message: CRM_REQUIRED_MESSAGE })).toBe(true);
  });
});

describe('hostAccessTarget', () => {
  it.each([
    [`${BASE}/api/host/hostels/Ab12`, { hostelId: 'Ab12', nested: false }],
    [`${BASE}/api/host/hostels/Ab12/`, { hostelId: 'Ab12', nested: false }],
    [`${BASE}/api/host/hostels/Ab12?x=1`, { hostelId: 'Ab12', nested: false }],
    [`${BASE}/api/host/hostels/Ab12/rooms`, { hostelId: 'Ab12', nested: true }],
    [`${BASE}/api/host/hostels/Ab12/rooms/9?page=2`, { hostelId: 'Ab12', nested: true }],
  ])('reads %s', (url, target) => {
    expect(hostAccessTarget(url)).toEqual(target);
  });

  it.each([
    `${BASE}/api/host/hostels`,
    `${BASE}/api/host/hostels/`,
    `${BASE}/api/host/hostels?page=1`,
    `${BASE}/api/moderator/hostels/Ab12/rooms`,
  ])('returns null for %s', (url) => {
    expect(hostAccessTarget(url)).toBeNull();
  });
});

describe('HostAccessEvents', () => {
  const owner: SessionUser = {
    id: 'uA',
    name: 'Imran',
    email: 'i@h.pk',
    role: 'host',
    allRoles: ['host'],
    permissions: [],
  };
  let events: HostAccessEvents;
  let session: SessionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    session = TestBed.inject(SessionStore);
    events = TestBed.inject(HostAccessEvents);
  });

  afterEach(() => session.clear());

  it('records nothing without a session user', () => {
    events.record({ hostelId: 'h1', kind: 'inactive' });
    expect(events.observations()).toEqual([]);
    expect(events.mark()).toBe(0);
  });

  it('stamps each observation with the owner and the next seq', () => {
    session.setSession(owner, 'tok');
    const before = events.mark();
    events.record({ hostelId: 'h1', kind: 'inactive' });
    events.record({ hostelId: 'h2', kind: 'crmRequired' });
    expect(events.observations()).toEqual([
      { hostelId: 'h1', kind: 'inactive', owner: 'uA', seq: before },
      { hostelId: 'h2', kind: 'crmRequired', owner: 'uA', seq: before + 1 },
    ]);
    expect(events.mark()).toBe(before + 2);
  });

  it('replaces a repeat of the same refusal with a fresh seq', () => {
    session.setSession(owner, 'tok');
    events.record({ hostelId: 'h1', kind: 'inactive' });
    events.record({ hostelId: 'h1', kind: 'crmRequired' });
    events.record({ hostelId: 'h1', kind: 'inactive' });
    expect(events.observations().map((o) => [o.kind, o.seq])).toEqual([
      ['crmRequired', 1],
      ['inactive', 2],
    ]);
  });

  it('exposes only the signed-in user\'s observations', () => {
    session.setSession(owner, 'tok');
    events.record({ hostelId: 'h1', kind: 'inactive' });
    session.setSession({ ...owner, id: 'uB' }, 'tok2');
    expect(events.observations()).toEqual([]);
    events.record({ hostelId: 'h1', kind: 'crmRequired' });
    expect(events.observations().map((o) => o.owner)).toEqual(['uB']);
    session.clear();
    expect(events.observations()).toEqual([]);
    session.setSession(owner, 'tok');
    expect(events.observations().map((o) => o.kind)).toEqual(['inactive']);
  });

  it('clears only the named hostel, and only below the mark', () => {
    session.setSession(owner, 'tok');
    events.record({ hostelId: 'h1', kind: 'inactive' });
    events.record({ hostelId: 'h2', kind: 'inactive' });
    const mark = events.mark();
    events.record({ hostelId: 'h1', kind: 'crmRequired' });
    events.clear('h1', mark);
    expect(events.observations().map((o) => [o.hostelId, o.kind])).toEqual([
      ['h2', 'inactive'],
      ['h1', 'crmRequired'],
    ]);
  });

  it('keeps the same array when a clear drops nothing', () => {
    session.setSession(owner, 'tok');
    events.record({ hostelId: 'h1', kind: 'inactive' });
    const before = events.observations();
    events.clear('h2', events.mark());
    expect(events.observations()).toBe(before);
  });

  describe('expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      session.setSession(owner, 'tok');
      // Saving the session writes localStorage, and jsdom queues the `storage` event on a 0 ms
      // timer. Run it, so `getTimerCount()` below counts only the refusals' expiry clocks.
      vi.advanceTimersByTime(0);
    });

    afterEach(() => vi.useRealTimers());

    it('drops a refusal two minutes after it was recorded', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      vi.advanceTimersByTime(HOST_ACCESS_TTL_MS - 1000);
      expect(events.observations()).toHaveLength(1);
      vi.advanceTimersByTime(1000);
      expect(events.observations()).toEqual([]);
    });

    it('expires each refusal on its own clock', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      vi.advanceTimersByTime(60_000);
      events.record({ hostelId: 'h2', kind: 'crmRequired' });
      vi.advanceTimersByTime(60_000);
      expect(events.observations().map((o) => o.hostelId)).toEqual(['h2']);
      vi.advanceTimersByTime(60_000);
      expect(events.observations()).toEqual([]);
    });

    it('re-arms the clock when the same refusal is seen again', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      vi.advanceTimersByTime(90_000);
      events.record({ hostelId: 'h1', kind: 'inactive' });
      vi.advanceTimersByTime(HOST_ACCESS_TTL_MS - 1000);
      expect(events.observations().map((o) => o.seq)).toEqual([1]);
      vi.advanceTimersByTime(1000);
      expect(events.observations()).toEqual([]);
    });

    it('expires a refusal while its owner is signed out', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      session.clear();
      vi.advanceTimersByTime(HOST_ACCESS_TTL_MS);
      session.setSession(owner, 'tok');
      expect(events.observations()).toEqual([]);
    });

    it('cancels the clock of a refusal that is cleared first', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      events.clear('h1', events.mark());
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels pending clocks when destroyed', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      expect(vi.getTimerCount()).toBe(1);
      TestBed.resetTestingModule();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('settle', () => {
    beforeEach(() => session.setSession(owner, 'tok'));

    it('drops the session user\'s refusals of that hostel seen before the mark', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      events.record({ hostelId: 'h1', kind: 'crmRequired' });
      events.record({ hostelId: 'h2', kind: 'inactive' });
      const mark = events.mark();
      events.record({ hostelId: 'h1', kind: 'crmRequired' });
      events.settle('h1', mark);
      expect(events.observations().map((o) => [o.hostelId, o.kind, o.seq])).toEqual([
        ['h2', 'inactive', 2],
        ['h1', 'crmRequired', 3],
      ]);
    });

    it('drops only the kinds it is given', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      events.record({ hostelId: 'h1', kind: 'crmRequired' });
      events.settle('h1', events.mark(), ['inactive']);
      expect(events.observations().map((o) => o.kind)).toEqual(['crmRequired']);
    });

    it('leaves another user\'s refusals alone', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      session.setSession({ ...owner, id: 'uB' }, 'tok2');
      events.settle('h1', events.mark());
      session.setSession(owner, 'tok');
      expect(events.observations().map((o) => o.kind)).toEqual(['inactive']);
    });

    it('does nothing when signed out', () => {
      events.record({ hostelId: 'h1', kind: 'inactive' });
      session.clear();
      events.settle('h1', events.mark());
      session.setSession(owner, 'tok');
      expect(events.observations().map((o) => o.kind)).toEqual(['inactive']);
    });
  });
});

describe('HostAccessEvents during a server render', () => {
  afterEach(() => {
    TestBed.inject(SessionStore).clear();
    vi.useRealTimers();
  });

  it('records without starting an expiry clock', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const events = TestBed.inject(HostAccessEvents);
    TestBed.inject(SessionStore).setSession(
      {
        id: 'uA',
        name: 'Imran',
        email: 'i@h.pk',
        role: 'host',
        allRoles: ['host'],
        permissions: [],
      },
      'tok',
    );
    vi.advanceTimersByTime(0); // jsdom's queued `storage` event, as in the expiry block above
    events.record({ hostelId: 'h1', kind: 'inactive' });
    expect(events.observations()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(HOST_ACCESS_TTL_MS * 2);
    expect(events.observations()).toHaveLength(1);
  });
});
