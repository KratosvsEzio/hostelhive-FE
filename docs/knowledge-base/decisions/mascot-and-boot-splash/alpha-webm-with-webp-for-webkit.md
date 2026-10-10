# Alpha WebM for Blink and Gecko, animated WebP for WebKit

**Status:** Accepted
**Area:** [mascot-and-boot-splash](../../area/mascot-and-boot-splash.md)

## Context

The bee is a 3D render that must sit over any background, so it needs transparency. VP9 WebM with an
alpha channel is small and plays smoothly at 60 fps. But WebKit, which includes Safari and every iOS
browser whatever its name, plays VP9 and silently drops the alpha, painting a black square. It also
answers "probably" to `canPlayType`, so the codec query can't detect this.

## Decision

Decide from the engine, not the codec: `supportsAlphaWebm(userAgent)` returns false for any iOS
device and for WebKit that isn't Blink.

- **Chrome, Edge and Firefox** get the WebM: 288 px, 60 fps.
- **WebKit** gets an animated WebP: 192 px at 50 fps. 50 fps is exactly four frames per 12.5 Hz
  wingbeat, so the flutter stays regular.
- **Reduced motion** gets a still WebP.

## Alternatives rejected

- **HEVC with alpha (`.mov`) for Safari**: larger files and an extra encode pipeline. WebP covers the
  sizes used (72–200 px) well.
- **Lottie or a sprite sheet**: the bee is a lit 3D render; flattening it to vectors loses the look.
- **`canPlayType` detection**: gives the wrong answer on WebKit, as described above.

## Consequences

Every clip ships twice (`.webm` and `.webp`), and the boot splash script in `apps/web/src/index.html`
repeats the same engine check because it runs before the app.

## Evidence

- `apps/web/src/app/shared/mascot/mascot.ts` (`supportsAlphaWebm` and its comment)
- `apps/web/src/app/shared/mascot/mascot.spec.ts` (the user-agent cases)
- Commit `72418a3` "feat(web): Hive Bee mascot for the startup wait and search states"
