import { ADMIN_ROUTES } from './admin.routes';

describe('feature-admin routes', () => {
  // Every screen hangs off a single StaffLayout shell route that supplies the console
  // chrome, so asserting on the top level would only ever see that wrapper.
  const shell = ADMIN_ROUTES[0];
  const children = shell.children ?? [];

  it('nests every screen under the staff shell', () => {
    expect(ADMIN_ROUTES).toHaveLength(1);
    expect(shell.path).toBe('');
    expect(shell.component).toBeDefined();
  });

  it('exposes the admin screens', () => {
    const screens = children.map((r) => r.path).filter((p) => p !== '');
    expect([...screens].sort()).toEqual([
      'contracts',
      'listings',
      'payments',
      'queue',
      'review/:id',
      'roles',
    ]);
  });

  it('lands on contracts by default', () => {
    expect(children[0]).toMatchObject({ path: '', redirectTo: 'contracts' });
  });
});
