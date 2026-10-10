# Primary brand colour is brand-500 (#F36E21), accepting sub-AA white text

**Status:** Accepted
**Area:** [ui-library](../../area/ui-library.md)

## Context
An accessibility pass found `brand-600` (#D2560F) at 4.14:1 on white, below AA. That step painted text links (about 154 `text-brand-600` call sites) and the primary button fill. It was retuned to #B94F06 (5.02:1 on white, at least 4.53:1 on every tint, `ink-50`, `surface` and `brand-50`) and the primary button moved to it (fc1eb8b).

## Decision
Use `brand-500` (#F36E21), the brand orange, for buttons, avatars, links, active and selected states. `brand-600` stays as the hover step only. White text on `brand-500` is 2.97:1, below AA for body text. This is a recorded product decision; the button label is bold to partly compensate (`lib/src/ui/lib/button/button.ts`).

## Alternatives rejected
- **Keep the retuned `brand-600` (#B94F06) as the fill and link colour.** It passes AA but "read as burnt across every screen", and the button is the most-seen brand surface (commit 2bfdae8).
- **#C05408**, the nearest value that passes on white (4.65). It fails on the grounds it actually sits on: 4.27 on `surface`, 4.20 on `brand-50` (`lib/tailwind-preset.js` comment).
- **A brand-tinted focus ring (`brand-300`).** 1.47:1 against the `brand-500` fill. Replaced by `ink-900` with an offset (`lib/src/ui/lib/button/button.ts`).

## Consequences
- Do not "fix" `bg-brand-500 text-white` back to `brand-600` as an a11y regression. The blog contrast spec allows `brand-500` fills under white and still rejects anything lighter (`apps/web/src/app/features/public/blog/blog-contrast.spec.ts`).
- The `brand-600` comment in `lib/tailwind-preset.js` still describes the old state (links and button fill). Treat the code as the truth.
- Focus visibility does not depend on the brand colour, because the ring is `ink-900`.

## Evidence
- 2bfdae8 style(brand): use brand-500 (#F36E21) throughout instead of the darker steps (PR #36)
- fc1eb8b fix(a11y): bring the listing chrome to AA and make it work from a keyboard
- 3f8f5c4 fix(a11y): give every control a keyboard, a name, and a visible focus
- `lib/src/ui/lib/button/button.ts` (`FILLED.primary` comment), `lib/tailwind-preset.js`
