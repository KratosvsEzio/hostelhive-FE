// Generates the full HostelHive icon set from the bed-in-hive brand mark.
//   web favicons + apple-touch + PWA icons → apps/web/public/
//   Capacitor sources (icon + splash) → assets/   (consumed by `capacitor-assets generate`)
// Re-run with:  npm run icons:generate
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'apps/web/public');
const ASSETS = join(ROOT, 'assets');
mkdirSync(ASSETS, { recursive: true });

// The elegant bed-in-hive mark, authored in a 0..64 viewBox.
const MARK =
  '<path d="M58.1 37.02 L49.4 52.08 Q46.5 57.1 40.7 57.1 L23.3 57.1 Q17.5 57.1 14.6 52.08 L5.9 37.02 Q3 32 5.9 26.98 L14.6 11.92 Q17.5 6.9 23.3 6.9 L40.7 6.9 Q46.5 6.9 49.4 11.92 L58.1 26.98 Q61 32 58.1 37.02 Z" fill="#F36E21"/>' +
  '<g fill="#ffffff">' +
  '<rect x="19" y="21" width="4.5" height="18" rx="2.25"/>' +
  '<rect x="19" y="28.5" width="27" height="8" rx="4"/>' +
  '<rect x="23" y="23.5" width="8.5" height="5.5" rx="2.75"/>' +
  '<rect x="22" y="36.5" width="4" height="6.5" rx="2"/>' +
  '<rect x="42" y="36.5" width="4" height="6.5" rx="2"/>' +
  '</g>';

// SVG buffer: the mark centered in a `size` square with `pad` px breathing room,
// over an optional solid background (`bg` null = transparent corners).
function markSvg(size, pad, bg) {
  const s = (size - 2 * pad) / 64;
  const bgRect = bg
    ? `<rect width="${size}" height="${size}" fill="${bg}"/>`
    : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `${bgRect}<g transform="translate(${pad},${pad}) scale(${s})">${MARK}</g></svg>`,
  );
}

const png = (size, pad, bg, out) =>
  sharp(markSvg(size, pad, bg))
    .png()
    .toFile(out)
    .then(() => console.log('  +', out.replace(ROOT, '.')));

const solid = (size, color, out) =>
  sharp({
    create: { width: size, height: size, channels: 4, background: color },
  })
    .png()
    .toFile(out)
    .then(() => console.log('  +', out.replace(ROOT, '.')));

async function main() {
  console.log('web favicons -> apps/web/public');
  await png(16, 0, null, join(PUBLIC, 'favicon-16.png'));
  await png(32, 0, null, join(PUBLIC, 'favicon-32.png'));
  await png(48, 0, null, join(PUBLIC, 'favicon-48.png'));
  await png(180, 26, '#ffffff', join(PUBLIC, 'apple-touch-icon.png'));
  await png(192, 30, '#ffffff', join(PUBLIC, 'icon-192.png'));
  await png(512, 82, '#ffffff', join(PUBLIC, 'icon-512.png'));

  const icoSizes = await Promise.all(
    [16, 32, 48].map((s) =>
      sharp(markSvg(s, 0, null))
        .png()
        .toBuffer(),
    ),
  );
  writeFileSync(join(PUBLIC, 'favicon.ico'), await pngToIco(icoSizes));
  console.log('  + ./apps/web/public/favicon.ico');

  console.log('capacitor sources -> assets');
  await png(1024, 120, '#ffffff', join(ASSETS, 'icon-only.png'));
  await png(1024, 190, null, join(ASSETS, 'icon-foreground.png'));
  await solid(1024, '#ffffff', join(ASSETS, 'icon-background.png'));
  await png(2732, 1110, '#ffffff', join(ASSETS, 'splash.png'));
  await png(2732, 1110, '#1f1f1f', join(ASSETS, 'splash-dark.png'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
