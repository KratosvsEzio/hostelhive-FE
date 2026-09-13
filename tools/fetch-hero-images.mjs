// Downloads accommodation photos (hostel dorm, room, bunk beds, co-living) from
// Wikimedia Commons, smart-crops to hex tiles, and bundles them under
// apps/web/public/hero/ for the landing hero honeycomb.
// Every photograph here requires attribution; the licence and author travel with each entry
// below and are written into CREDITS.json, which /credits renders.
// Re-run:  node tools/fetch-hero-images.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps/web/public/hero');
mkdirSync(OUT, { recursive: true });
const UA = 'HostelHiveBot/1.0 (landing hero tiles; contact: dev@hostelhive.pk)';

/**
 * The photographs, with the terms they come under.
 *
 * The licence lives here rather than only in the generated file, because this script writes
 * `CREDITS.json` wholesale: when the licences were finally read off Commons and recorded, a
 * re-run of this tool would have wiped them and left the thin "check the source page" note
 * behind. What a photograph is licensed under belongs next to its URL.
 */
const items = [
  {
    slug: 'dorm',
    label: 'Hostel dormitory',
    source:
      'https://upload.wikimedia.org/wikipedia/commons/0/0c/Hostel_6-bed_dorm_room%2C_Kuching%2C_Malaysia.jpg',
    commonsPage:
      'https://commons.wikimedia.org/wiki/File:Hostel_6-bed_dorm_room,_Kuching,_Malaysia.jpg',
    author: 'Sgroey',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Photo by Sgroey, via Wikimedia Commons — CC BY 4.0',
    note: 'Replaced File:Hostel_Dormitory.jpg, which was GFDL and whose file page demanded that a named third-party site be credited — a condition this product should not be carrying on its home page. Attribution only, no share-alike, so the crop below inherits no obligation of its own.',
  },
  {
    slug: 'coliving',
    label: 'Co-living shared space',
    source:
      'https://upload.wikimedia.org/wikipedia/commons/1/1a/Northernhay_House_shared_kitchen_%289622567534%29.jpg',
    commonsPage:
      'https://commons.wikimedia.org/wiki/File:Northernhay_House_shared_kitchen_(9622567534).jpg',
    author: 'University of Exeter',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    attribution: 'Photo by University of Exeter, via Wikimedia Commons — CC BY 2.0',
    note: 'Attribution only, no copyleft: the crop carries no obligation of its own.',
  },
  {
    slug: 'loft',
    label: 'Loft living space',
    source:
      'https://upload.wikimedia.org/wikipedia/commons/3/37/Stylish_living_room_features_a_comfortable_gray_sofa_and_wooden_paneling_under_a_high_ceiling.jpg',
    commonsPage:
      'https://commons.wikimedia.org/wiki/File:Stylish_living_room_features_a_comfortable_gray_sofa_and_wooden_paneling_under_a_high_ceiling.jpg',
    author: 'Shixart1985',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    attribution: 'Photo by Shixart1985, via Wikimedia Commons — CC BY 2.0',
    note: 'Replaced File:400SGreenLoft.jpg, which was CC BY-SA 3.0 / GFDL. The source calls this "a stylish living room ... under a high ceiling" rather than a loft, which is the closest honest match Commons offers under an attribution-only licence — a search for residential loft interiors returns church choir lofts and building exteriors. The tile\'s alt text still reads "Loft living space"; it should be re-worded to the source\'s own description when the locale files are next editable.',
  },
  {
    slug: 'living',
    label: 'Shared lounge',
    source:
      'https://upload.wikimedia.org/wikipedia/commons/6/65/Cozy_cabin_living_room_with_wooden_interior.jpg',
    commonsPage:
      'https://commons.wikimedia.org/wiki/File:Cozy_cabin_living_room_with_wooden_interior.jpg',
    author: 'Shixart1985',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    attribution: 'Photo by Shixart1985, via Wikimedia Commons — CC BY 2.0',
    note: 'Replaced File:Sittingroom-edit1.jpg, which was CC BY-SA 2.5/2.0/1.0 plus GFDL and was itself a derivative, so its page named an editor as well as the photographer. Attribution only, no share-alike.',
  },
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
for (const item of items) {
  const { slug, label, source: url } = item;
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
    credits.push({
      file: `/hero/${slug}.jpg`,
      social: `/hero/social/${slug}.jpg`,
      label,
      source: url,
      commonsPage: item.commonsPage,
      author: item.author,
      licence: item.licence,
      licenceUrl: item.licenceUrl,
      attribution: item.attribution,
      ...(item.note ? { note: item.note } : {}),
    });
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
        'Checked against Wikimedia Commons. Every photograph below is attribution-only — CC BY, no share-alike and no third-party credit conditions — so the cropped tiles carry no licence terms of their own. Credits are rendered at /credits.',
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
