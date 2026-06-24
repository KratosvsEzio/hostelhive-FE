// Downloads accommodation photos (hostel dorm, room, bunk beds, co-living) from
// Wikimedia Commons, smart-crops to hex tiles, and bundles them under
// apps/web/public/hero/ for the landing hero honeycomb. CC-licensed — keep
// attribution for production. Re-run:  node tools/fetch-hero-images.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
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

let ok = 0;
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
console.log(
  `\n${ok}/${items.length} hero tiles written to apps/web/public/hero/`,
);
