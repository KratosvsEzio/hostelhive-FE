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
    events.record({ hostelId: 'h1', kind: 'inactive' });
    expect(events.observations()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(HOST_ACCESS_TTL_MS * 2);
    expect(events.observations()).toHaveLength(1);
  });
});
