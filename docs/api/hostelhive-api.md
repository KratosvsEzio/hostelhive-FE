# HostelHive API — Contract Reference

> Extracted from the Hoppscotch collection (2026-06). **Request** shapes are
> authoritative; **response** shapes are not captured yet (the export saved no
> response bodies) and must be confirmed against the live API before mapping.
>
> ⚠️ The original export contained live JWTs, a Google OAuth `access_token`, and
> Airbnb session cookies. **None of those belong in the repo** — tokens are
> obtained at runtime via `sign_in` and held in `SessionStore`. Treat the
> original file as a secret.

## Conventions

- **Dev base URL:** `http://localhost:3000` (the FE `API_CONFIG.baseUrl`).
  Paths below include their `/api` or `/public` prefix.
- **Auth:** `Authorization: Bearer <jwt>`. The JWT payload decodes to
  `{ id, email, phone, name, jti, expiry }` — **no role/permissions**, so those
  must come from the `sign_in` response body or `GET /api/users/:id` (to confirm).
- **Nested writes:** Rails `accepts_nested_attributes_for` — e.g.
  `room_types_attributes`, `rooms_attributes`, `renter_bills_attributes`.
- `/public/**` is the unauthenticated seeker surface; `/api/**` requires a token.
- **CORS:** the FE attaches `withCredentials: true`; Rails must allow the FE
  origin (not `*`) with credentials for browser calls to succeed.

---

## Core ▸ User  (`/api/user`, `/api/users`)

| Action | Method | Path | Request body / params |
|---|---|---|---|
| Sign in | POST | `/api/user/sign_in` | `{ email, password }` |
| Sign up | POST | `/api/user/sign_up` | `{ user: { name, email, password, phone } }` |
| Google login | POST | `/api/user/google_login` | `{ access_token }` |
| Sign out | — | `/api/user/sign_out` *(endpoint TBC)* | — |
| Show user | GET | `/api/users/:id` | — |
| Update user | PATCH | `/api/users/:id` | `{ user: { name, email, phone } }` |
| Avatar upload URL | GET | `/api/avatars/presigned_url` | `?key=avatar&content_type=image/jpeg&label_id=` |

## Core ▸ Hostel  (`/api/hostels`, `/public/hostels`)

| Action | Method | Path | Request body / params |
|---|---|---|---|
| Public search | GET | `/public/hostels` | `?f[bounding][north|south|east|west]=…` (map bbox) |
| Show | GET | `/api/hostels/:id` | — |
| New (form meta) | GET | `/api/hostels/new` | — |
| Edit (form meta) | GET | `/api/hostels/:id/edit` | — |
| Create | POST | `/api/hostels` | see **Hostel payload** below |
| Update | PUT | `/api/hostels/:id` | `{ hostel: { attachment_ids[], banner_id, … } }` |
| Room types | GET | `/api/hostels/:id/room_types` | — |
| Current subscription | GET | `/api/hostels/:id/current_subscription` | — |

**Hostel payload** (`POST /api/hostels` → `{ hostel: { … } }`):
`name, description, gender_type (int), property_type (int), total_rooms,
total_floors, address_1, address_2, city, state, country, area, email,
latitude, longitude, min_price, max_price, primary_phone, secondary_phone,
is_active, is_featured, nearby_landmarks, notes,`
`room_types_attributes: [{ name, description, capacity, price }],`
`hostel_offers_attributes: [{ offer_id }],`
`rooms_attributes: [{ room_number, room_type_id, capacity }]`

> `gender_type` / `property_type` are integer enums — **confirm the int→label
> mapping** (e.g. 0=boys,1=girls,2=coliving?) against the BE before display.

## Core ▸ Offers
| Action | Method | Path |
|---|---|---|
| Offer categories | GET | `/api/offer_categories` |

---

## Host  (`/api/host/hostel/:hostelId/…`)

**Rooms** — `GET ?page&limit` · `POST { room: { room_number, room_type_id, capacity } }` ·
`GET/:id` · `PUT/:id { room: { room_type_id, capacity, renter_ids[] } }` · `DELETE/:id`

**Renters** — `GET` · `GET/:id` · `POST { renter: { full_name, email, phone,
emergency_contact, room_id, mess_charges, transportation_charges, advance_deposit,
joining_date, rent, address, rent_due_date, rent_issue_date } }` ·
`PUT/:id { renter: { room_id, … } }`

**Renter Bills** — `GET` · `GET/new` · `GET/:id/edit` · `POST { renter_bill: {
renter_id, room_id, amount, due_date, issued_date, break_down: { rent,
mess_charges, transportation_charges } } }` · `PUT/:id` · `PUT/:id/mark_as_paid` ·
`DELETE/:id`

**Utility Bills** — `GET` · `GET/:id` · `GET/new` · `POST { utility_bill: {
utility_type, total_amount, amount, consumed_units, total_units, room_id,
issued_date, due_date, cost_per_unit, notes, renter_bills_attributes: [...] } }` ·
`PUT/:id { utility_bill: { renter_bills_attributes: [{ id, amount }] } }` · `DELETE/:id`

---

## Moderator  (`/api/moderator/…`)

**Hostels** — `GET` · `GET/new` · `GET/:id` · `GET/:id/edit` ·
`PUT/:id { hostel: { name, nearby_landmarks, notes, … } }` · `PUT/:id/mark_as_active`

**Attachments** — `GET` · `GET/new` · `PUT/:uuid/mark_as_active` ·
`PUT/:uuid/update_label { attachment_label_id }`

**Document upload URL** — `GET /api/documents/presigned_url`
`?key=attachments|banner|logo&content_type=…&label_id=…`

---

## Admin  (`/api/admin/…`)

| Resource | Method | Path |
|---|---|---|
| Roles | GET | `/api/admin/roles` |
| Permissions (grouped) | GET | `/api/admin/permissions/grouped` |
| Contracts | GET | `/api/admin/contracts` · `/api/admin/contracts/:id` |
| Payments | GET | `/api/admin/payments` · `/api/admin/payments/:id` |

---

## Open questions (block accurate response mapping)

1. **Response envelopes** — bare array vs. `{ data: … }` vs. `{ hostels: [], meta: {} }`?
   Pagination: offset (`page`/`total`) or cursor?
2. **Where do `role` + `permissions` come from** at login (response body vs. `/users/:id`)?
3. **`gender_type` / `property_type`** integer enum → label mapping.
4. **JWT delivery** on `sign_in` — response **body** (`token`/`jwt`) or `Authorization` **header**?
   (`AuthApi` currently handles both.)
5. **`/public/hostels`** response item shape → map to FE `Listing` (`feature-search`).
6. **Sign-out** endpoint + method.
