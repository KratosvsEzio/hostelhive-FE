import { ADMIN_ROUTES } from './admin.routes';

describe('feature-admin routes', () => {
  it('exposes roles, contracts and payments', () => {
    expect(ADMIN_ROUTES.map((r) => r.path).sort()).toEqual([
      'contracts',
      'payments',
      'roles',
    ]);
  });
});
