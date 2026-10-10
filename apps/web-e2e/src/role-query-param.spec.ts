import { expect, test, type BrowserContext } from '@playwright/test';

// A `?role=` query param once seeded a fake console session in every build. These pin that
// it is now an ordinary, ignored query param: it grants nothing, and it cannot replace or
// skip the visitor's real session.

const TOKEN_COOKIE = 'hh_auth_token';

async function tokenCookie(context: BrowserContext): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === TOKEN_COOKIE)?.value;
}

test('a guest with ?role= is sent to sign-in, and no session is written', async ({ page, context }) => {
  await page.goto('/en/admin?role=super-admin');

  await expect(page).toHaveURL(/\/auth\b/);
  expect(await tokenCookie(context)).toBeUndefined();
});

test('?role= neither skips nor replaces a signed-in visitor\'s session', async ({ page, context, baseURL }) => {
  // Opaque on purpose: the app cannot read an expiry from it, so it must ask the server.
  const token = 'e2e-session-token';
  await context.addCookies([{ name: TOKEN_COOKIE, value: token, url: baseURL ?? 'http://localhost:4200' }]);

  // Answer the restore check here so the spec does not depend on a running backend.
  const restore = page.waitForResponse('**/api/users/current');
  await page.route('**/api/users/current', (route) =>
    route.fulfill({
      json: {
        success: true,
        user: {
          id: 1,
          name: 'E2E Host',
          email: 'host@example.test',
          is_active: true,
          is_admin: false,
          roles: [{ id: 1, name: 'Host', slug: 'host' }],
          permissions: null,
        },
      },
    }),
  );

  await page.goto('/en?role=super-admin');

  const response = await restore;
  expect(response.request().headers()['authorization']).toBe(`Bearer ${token}`);

  // Read only once the restored user has been seated, so a seed racing the restore cannot
  // pass by being overwritten in time.
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hh.auth.user') ?? 'null')?.email))
    .toBe('host@example.test');
  expect(await tokenCookie(context)).toBe(token);
});
