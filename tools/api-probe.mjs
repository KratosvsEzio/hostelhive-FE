#!/usr/bin/env node
/**
 * HostelHive API probe — dev-only. Signs in once, then GETs the key read
 * endpoints and prints their RESPONSE SHAPES (arrays truncated to the first
 * item) so the FE can map backend data → its models accurately.
 *
 * The Hoppscotch export captured request shapes but no response bodies; this
 * fills that gap against a live backend. It only performs reads + one sign-in.
 * It prints to stdout only — no tokens or responses are written to the repo.
 *
 *   node tools/api-probe.mjs [email] [password]
 *   HH_API=http://localhost:3000 node tools/api-probe.mjs admin@hostelhive.com Secret123!
 */

const BASE = (process.env.HH_API ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.argv[2] ?? process.env.HH_EMAIL ?? 'admin@hostelhive.com';
const PASSWORD = process.argv[3] ?? process.env.HH_PASS ?? 'Secret123!';

/** Recursively shrink a value to reveal its SHAPE without dumping all the data. */
function shape(v, depth = 0) {
  if (v === null || typeof v !== 'object') {
    return typeof v === 'string' && v.length > 160 ? v.slice(0, 160) + '…' : v;
  }
  if (Array.isArray(v)) {
    return v.length === 0
      ? []
      : [shape(v[0], depth + 1), `…(${v.length} items)`];
  }
  if (depth > 6) return '…';
  return Object.fromEntries(
    Object.entries(v).map(([k, val]) => [k, shape(val, depth + 1)]),
  );
}

function section(title) {
  console.log('\n' + '═'.repeat(72) + `\n${title}\n` + '─'.repeat(72));
}

async function call(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return {
    status: res.status,
    authHeader: res.headers.get('Authorization'),
    json,
  };
}

async function probe(label, method, path, opts) {
  try {
    const { status, json } = await call(method, path, opts);
    section(`${label}  —  ${method} ${path}  →  ${status}`);
    console.log(JSON.stringify(shape(json), null, 2));
    return json;
  } catch (e) {
    section(`${label}  —  ${method} ${path}  →  ERROR`);
    console.log(String(e.message ?? e));
    return undefined;
  }
}

async function main() {
  console.log(`Probing ${BASE} as ${EMAIL}`);

  // 1) Sign in — reveal token location (body vs Authorization header) + user shape.
  let token = null;
  let userId = null;
  try {
    const { status, authHeader, json } = await call(
      'POST',
      '/api/user/sign_in',
      {
        body: { email: EMAIL, password: PASSWORD },
      },
    );
    section(`Sign in  —  POST /api/user/sign_in  →  ${status}`);
    const fromBody = json?.token ?? json?.jwt ?? json?.data?.token;
    token =
      fromBody ?? (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null);
    console.log(
      'token in body? ',
      Boolean(fromBody),
      ' | token in Authorization header? ',
      Boolean(authHeader),
    );
    console.log('response shape:', JSON.stringify(shape(json), null, 2));
    const user = json?.user ?? json?.data?.user ?? json?.data;
    userId = user?.id ?? json?.id;
    console.log(
      '→ role field present on user?',
      user && 'role' in user,
      '| user.id =',
      userId,
    );
  } catch (e) {
    section('Sign in FAILED — is Rails up on ' + BASE + '?');
    console.log(String(e.message ?? e));
    return;
  }
  if (!token)
    console.log(
      '\n⚠️  No token found — authed probes will likely 401. Check sign-in response above.',
    );

  // 2) Public seeker list — the item shape we map to FE `Listing`.
  const pub = await probe('Public hostels', 'GET', '/public/hostels', {
    token,
  });
  const list = Array.isArray(pub)
    ? pub
    : (pub?.hostels ?? pub?.data ?? pub?.items ?? []);
  const firstId = list?.[0]?.id ?? list?.[0]?.hostel?.id;

  // 3) Authed reads.
  if (userId != null)
    await probe('User show', 'GET', `/api/users/${userId}`, { token });
  await probe('Offer categories', 'GET', '/api/offer_categories', { token });
  if (firstId != null) {
    await probe('Hostel show', 'GET', `/api/hostels/${firstId}`, { token });
    await probe(
      'Hostel room types',
      'GET',
      `/api/hostels/${firstId}/room_types`,
      { token },
    );
  } else {
    console.log(
      '\n(no hostel id from /public/hostels — skipping hostel show/room_types)',
    );
  }

  // 4) Staff surfaces (admin seed account).
  await probe('Admin roles', 'GET', '/api/admin/roles', { token });
  await probe(
    'Admin permissions (grouped)',
    'GET',
    '/api/admin/permissions/grouped',
    { token },
  );
  await probe('Moderator hostels', 'GET', '/api/moderator/hostels', { token });
  await probe('Admin contracts', 'GET', '/api/admin/contracts', { token });
  await probe('Admin payments', 'GET', '/api/admin/payments', { token });

  console.log('\nDone. Paste this output back if you ran it yourself.');
}

main();
