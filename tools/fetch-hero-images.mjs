// Downloads accommodation photos (hostel dorm, room, bunk beds, co-living) from
// Wikimedia Commons, smart-crops to hex tiles, and bundles them under
// apps/web/public/hero/ for the landing hero honeycomb. CC-licensed — keep
// attribution for production. Re-run:  node tools/fetch-hero-images.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps/web/public/hero');
mkdirSync(OUT, { recursive: true });
const UA = 'HostelHiveBot/1.0 (landing hero tiles; contact: dev@hostelhive.pk)';

const items = [
  [
    'dorm',
    'Hostel dormitory',
    'https://upload.wikimedia.org/wikipedia/commons/e/e8/Hostel_Dormitory.jpg',
  ],
  [
    'coliving',
    'Co-living shared space',
    'https://upload.wikimedia.org/wikipedia/commons/1/1a/Northernhay_House_shared_kitchen_%289622567534%29.jpg',
  ],
  [
    'loft',
    'Loft living space',
    'https://upload.wikimedia.org/wikipedia/commons/4/40/400SGreenLoft.jpg',
  ],
  [
    'living',
    'Shared lounge',
    'https://upload.wikimedia.org/wikipedia/commons/4/46/Sittingroom-edit1.jpg',
  ],
];

/**
 * The social card. Same reasoning as the city tiles: 560x480 is under Facebook's 600px
 * floor and the wrong aspect for the 1.91:1 crawlers crop to, so a shared page rendered a
 * small card or none. Cut from the original rather than upscaled from the tile.
 */
const SOCIAL = join(OUT, 'social');
mkdirSync(SOCIAL, { recursive: true });

let ok = 0;
const credits = [];
for (const [slug, label, url] of items) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error('  ✗', slug, '->', res.status);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize(560, 480, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(OUT, `${slug}.jpg`));
    await sharp(buf)
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(SOCIAL, `${slug}.jpg`));
    credits.push({ file: `/hero/${slug}.jpg`, social: `/hero/social/${slug}.jpg`, label, source: url });
    ok++;
    console.log(
      '  ✓',
      `${slug}.jpg`,
      `— ${label} (${(buf.length / 1024).toFixed(0)} KB)`,
    );
  } catch (e) {
    console.error('  ✗', slug, '->', e.message);
  }
}
/**
 * Attribution, recorded rather than remembered.
 *
 * These are CC-licensed photographs from Wikimedia Commons, and the licence follows the
 * file wherever it is used. The note at the top of this script has said "keep attribution
 * for production" since it was written, and nothing did — so the claim was not checkable
 * from the repository. Same shape as `public/blog/CREDITS.json`.
 */
writeFileSync(
  join(OUT, 'CREDITS.json'),
  `${JSON.stringify(
    {
      licence:
        'Each file below is derived from a photograph on Wikimedia Commons. Commons images carry their own CC licence — check the source page before publishing, and attribute as it requires.',
      note: 'Re-encoded to JPEG: a 560x480 hero tile and a 1200x630 social card, both smart-cropped from the full-resolution original.',
      images: credits,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `\n${ok}/${items.length} hero images written to apps/web/public/hero/ (tile + social card), attribution in CREDITS.json`,
);
