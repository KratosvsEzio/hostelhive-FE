import { MODERATOR_ROUTES } from './moderator.routes';

describe('feature-moderator routes', () => {
  // Every screen hangs off a single StaffLayout shell route that supplies the console
  // chrome, so asserting on the top level would only ever see that wrapper.
  const shell = MODERATOR_ROUTES[0];
  const children = shell.children ?? [];

  it('nests every screen under the staff shell', () => {
    expect(MODERATOR_ROUTES).toHaveLength(1);
    expect(shell.path).toBe('');
    expect(shell.component).toBeDefined();
  });

  it('exposes the moderator screens', () => {
    const screens = children.map((r) => r.path).filter((p) => p !== '');
    expect(screens).toEqual(['queue', 'review/:id', 'media', 'audit']);
  });

  it('lands on the queue by default', () => {
    expect(children[0]).toMatchObject({ path: '', redirectTo: 'queue' });
  });
});
