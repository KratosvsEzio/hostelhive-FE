import { ActivatedRouteSnapshot, Route } from '@angular/router';
import { AppRouteReuseStrategy } from './route-reuse-strategy';

class Bookings {}
class Rooms {}
class RoomDetail {}
class Tenants {}
class TenantProfile {}
class Invoices {}
class AddGrocery {}

const DRAWER_HOST = { drawerHost: true };

/** Only `component` and `routeConfig` are read, so a snapshot is just those two. */
function snapshot(component: unknown, routeConfig: Route | null): ActivatedRouteSnapshot {
  return { component, routeConfig } as unknown as ActivatedRouteSnapshot;
}

function route(path: string, component: unknown, data?: Route['data']): ActivatedRouteSnapshot {
  return snapshot(component, { path, component: component as Route['component'], data });
}

describe('AppRouteReuseStrategy.shouldReuseRoute', () => {
  const strategy = new AppRouteReuseStrategy();
  const reuse = (future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot) =>
    strategy.shouldReuseRoute(future, curr);

  describe('drawer routes of one page', () => {
    it('keeps Bookings alive between the list and a booking detail, both ways', () => {
      const list = route('bookings', Bookings, DRAWER_HOST);
      const detail = route('bookings/:bookingId', Bookings, DRAWER_HOST);
      expect(reuse(detail, list)).toBe(true);
      expect(reuse(list, detail)).toBe(true);
    });

    it('keeps Invoices alive between the list and an invoice view, both ways', () => {
      const list = route('', Invoices, DRAWER_HOST);
      const view = route('view/:billId', Invoices, DRAWER_HOST);
      expect(reuse(view, list)).toBe(true);
      expect(reuse(list, view)).toBe(true);
    });

    it('keeps Rooms alive between the list and the create drawer', () => {
      const list = route('', Rooms, DRAWER_HOST);
      const create = route('create', Rooms, DRAWER_HOST);
      expect(reuse(create, list)).toBe(true);
      expect(reuse(list, create)).toBe(true);
    });

    it('keeps Tenants alive between the list and the edit drawer', () => {
      const list = route('', Tenants, DRAWER_HOST);
      const edit = route('edit/:tenantId', Tenants, DRAWER_HOST);
      expect(reuse(edit, list)).toBe(true);
      expect(reuse(list, edit)).toBe(true);
    });
  });

  describe('routes that must re-initialise', () => {
    it('does not reuse across different components even when both are flagged', () => {
      expect(reuse(route('bookings', Bookings, DRAWER_HOST), route('', Rooms, DRAWER_HOST))).toBe(false);
    });

    it('does not reuse a shared component that is not flagged', () => {
      const mess = route('add', AddGrocery);
      const expenses = route('new', AddGrocery);
      expect(reuse(expenses, mess)).toBe(false);
      expect(reuse(mess, expenses)).toBe(false);
    });

    it('does not reuse when only the incoming route is flagged', () => {
      expect(reuse(route('create', Rooms, DRAWER_HOST), route('other', Rooms))).toBe(false);
    });

    it('does not reuse when only the outgoing route is flagged', () => {
      expect(reuse(route('other', Rooms), route('create', Rooms, DRAWER_HOST))).toBe(false);
    });

    it('does not reuse when the flag is present but falsy', () => {
      expect(
        reuse(route('a', Rooms, { drawerHost: false }), route('b', Rooms, { drawerHost: false })),
      ).toBe(false);
    });

    it('tears Rooms down on the way to a room detail', () => {
      const list = route('', Rooms, DRAWER_HOST);
      const detail = route(':roomId', RoomDetail);
      expect(reuse(detail, list)).toBe(false);
      expect(reuse(list, detail)).toBe(false);
    });

    it('tears Tenants down on the way to a tenant profile', () => {
      const list = route('', Tenants, DRAWER_HOST);
      const profile = route('profile/:tenantId', TenantProfile);
      expect(reuse(profile, list)).toBe(false);
      expect(reuse(list, profile)).toBe(false);
    });

    it('does not reuse when the incoming snapshot has no routeConfig', () => {
      expect(reuse(snapshot(Rooms, null), route('', Rooms, DRAWER_HOST))).toBe(false);
    });
  });

  describe('the default identity fallback', () => {
    it('reuses a route against itself', () => {
      const config: Route = { path: 'overview' };
      expect(reuse(snapshot(null, config), snapshot(null, config))).toBe(true);
    });

    it('reuses the very same config of an unflagged component', () => {
      const config: Route = { path: 'add', component: AddGrocery as Route['component'] };
      expect(reuse(snapshot(AddGrocery, config), snapshot(AddGrocery, config))).toBe(true);
    });

    it('reuses two component-less snapshots that both have no routeConfig', () => {
      expect(reuse(snapshot(null, null), snapshot(null, null))).toBe(true);
    });

    it('does not reuse two different configs of unflagged routes', () => {
      expect(reuse(route('a', Invoices), route('b', Invoices))).toBe(false);
      expect(reuse(snapshot(null, { path: 'a' }), snapshot(null, { path: 'b' }))).toBe(false);
    });

    it('does not reuse two different component-less configs even when both are flagged', () => {
      const a: Route = { path: 'a', data: DRAWER_HOST };
      const b: Route = { path: 'b', data: DRAWER_HOST };
      expect(reuse(snapshot(null, a), snapshot(null, b))).toBe(false);
    });
  });

  describe('detach and attach hooks', () => {
    const any = route('create', Rooms, DRAWER_HOST);

    it('never detaches', () => {
      expect(strategy.shouldDetach(any)).toBe(false);
    });

    it('never attaches', () => {
      expect(strategy.shouldAttach(any)).toBe(false);
    });

    it('retrieves nothing', () => {
      expect(strategy.retrieve(any)).toBeNull();
    });

    it('stores nothing and does not throw', () => {
      expect(() => strategy.store(any, null)).not.toThrow();
      expect(strategy.retrieve(any)).toBeNull();
    });
  });
});
