# Bake the hero's clouds into transparent images

**Status:** Pending — on branch `feat/mascot-loader` (PR #43), not on `main`
**Area:** [landing-page](../../area/landing-page.md)

## Context

The hero's clouds started as white-on-black "plates" laid over the photo with
`mix-blend-mode: screen` (the black disappears), and most were cut to shape with CSS gradient masks:
a top fade so no straight plate edge shows, and a radial billow shape for the scene-change clouds.

Profiled in Chrome on the project machine's Intel UHD GPU, the hero idled at **13 fps** with frames up
to 188 ms, and scene changes ran at 31 fps. Because the photo always zooms slowly and the cloud banks
always drift, the browser re-blended and re-masked six screen-sized layers on every frame, even when
nothing seemed to be happening. Switching effects off one at a time showed blend modes and masks as
the main costs.

## Decision

Pre-bake each cloud as a real transparent image: white clouds with an alpha channel, with the top
fade and the billow shape built into the alpha. The layers then need only `transform` and `opacity`,
which the GPU composites without repainting. Screen-blending a white-on-black plate is mathematically
the same as a white overlay with that alpha, so the look is unchanged (compared in screenshots at
rest and mid-change).

Result on the same machine: idle **94 fps**, scene change 96 fps, scroll 158 fps (headless Chrome is
not capped at 60).

## Alternatives rejected

- **Keep the blend and the masks, drop the drift and Ken Burns zoom**: smoother, but the hero would
  lose the slow life that makes it feel premium.
- **`will-change` on every layer**: promotes the layers but the blend still has to be recomputed
  against a moving photo.
- **Lossless alpha WebP from ffmpeg**: about 515 KB for the set. Re-encoded with lossy alpha (Pillow,
  `alpha_quality=55`) at 1280 px it is 92 KB, close to the 66 KB of the original plates. The clouds are
  soft, so the lower resolution doesn't show.

## Consequences

- Changing a cloud's shape means re-baking the image, not editing CSS.
- The rail uses 160 px thumbnails, and the scene photos are decoded on idle, for the same reason:
  nothing large should decode or re-blend in the middle of an animation.

## Evidence

- `apps/web/src/app/features/public/home/hero-sky/hero-sky.scss` (the comment on `.hc-cl`)
- `apps/web/public/landing/clouds-*.webp`
- Commit `083e611` "feat(web): \"Above the clouds\" landing page" (performance bullet)
