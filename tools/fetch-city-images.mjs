// Builds each city's hex tile and social card into apps/web/public/cities/, so the carousel
// works offline (Capacitor) and fast.
//
// Two kinds of source. Pexels photographs already vetted for the blog are read off disk:
// their licence is free for commercial use with no attribution and no share-alike, so a
// cropped tile carries no terms of its own. The rest are still Wikimedia Commons originals,
// fetched over the network, and every one of those is copyleft — see CREDITS.json and /credits.
// Re-run with:  node tools/fetch-city-images.mjs
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps/web/public/cities');
mkdirSync(OUT, { recursive: true });

const UA =
  'HostelHiveBot/1.0 (landing page city tiles; contact: dev@hostelhive.pk)';

/**
 * The ten tiles, with where each photograph comes from and what it may be used for.
 *
 * Four are Pexels images this repository already ships for the blog — free for commercial
 * use, no attribution, no share-alike — read off disk rather than downloaded again.
 *
 * The other six are still Wikimedia Commons originals and are still copyleft. Commons has no
 * attribution-only photograph of those cities: its Pakistani city set is almost entirely Wiki
 * Loves Monuments, which is share-alike by contest rule. They are waiting on Pexels
 * replacements, and until then the share-alike terms attach to the tiles this site serves.
 */
const cities = [
  {
    "slug": "karachi",
    "landmark": "KMC Building",
    "local": "/blog/student-hostels-in-karachi-where-students-live/kmc-building.webp",
    "source": "https://www.pexels.com/photo/29296199/",
    "sourceDescription": "View of the iconic KMC Building in Karachi at twilight, showcasing colonial architecture",
    "licence": "Pexels License",
    "licenceUrl": "https://www.pexels.com/license/",
    "attribution": "Photo from Pexels — free for commercial use, no attribution required",
    "note": "Re-used from the blog set rather than downloaded again: same file, already vetted. No attribution and no share-alike, so the cropped tile carries no terms of its own."
  },
  {
    "slug": "lahore",
    "landmark": "Badshahi Mosque",
    "local": "/blog/student-hostels-in-lahore-a-practical-guide/badshahi.webp",
    "source": "https://www.pexels.com/photo/13629907/",
    "sourceDescription": "Scenic view of Badshahi Mosque in Lahore with flying birds against a clear blue sky",
    "licence": "Pexels License",
    "licenceUrl": "https://www.pexels.com/license/",
    "attribution": "Photo from Pexels — free for commercial use, no attribution required",
    "note": "Re-used from the blog set rather than downloaded again: same file, already vetted. No attribution and no share-alike, so the cropped tile carries no terms of its own."
  },
  {
    "slug": "islamabad",
    "landmark": "Faisal Mosque",
    "local": "/blog/student-hostels-in-islamabad-sector-by-sector/faisal-mosque.webp",
    "source": "https://www.pexels.com/photo/5258953/",
    "sourceDescription": "Iconic view of Faisal Mosque in Islamabad, Pakistan, under a bright blue sky with clouds",
    "licence": "Pexels License",
    "licenceUrl": "https://www.pexels.com/license/",
    "attribution": "Photo from Pexels — free for commercial use, no attribution required",
    "note": "Re-used from the blog set rather than downloaded again: same file, already vetted. No attribution and no share-alike, so the cropped tile carries no terms of its own."
  },
  {
    "slug": "rawalpindi",
    "landmark": "City mosque",
    "local": "/blog/rawalpindi-or-islamabad-for-students/pindi-mosque.webp",
    "source": "https://www.pexels.com/photo/17483503/",
    "sourceDescription": "A stunning view of a mosque's ornate dome and minarets in Rawalpindi, Pakistan, showcasing Islamic architecture",
    "licence": "Pexels License",
    "licenceUrl": "https://www.pexels.com/license/",
    "attribution": "Photo from Pexels — free for commercial use, no attribution required",
    "note": "Re-used from the blog set rather than downloaded again: same file, already vetted. No attribution and no share-alike, so the cropped tile carries no terms of its own."
  },
  {
    "slug": "faisalabad",
    "landmark": "Clock Tower",
    "source": "https://upload.wikimedia.org/wikipedia/commons/f/f1/Clock_Tower_Faisalabad_by_Usman_Nadeem.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Clock_Tower_Faisalabad_by_Usman_Nadeem.jpg",
    "author": "Usman Nadeem",
    "licence": "CC BY-SA 4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "Photo by Usman Nadeem, via Wikimedia Commons — CC BY-SA 4.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  },
  {
    "slug": "peshawar",
    "landmark": "Islamia College",
    "source": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Islamia_College_Peshawar_%28Public_Sector_University%29%2C_Khyber_Pakhtunkhwa%2C_Pakistan_cropped.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Islamia_College_Peshawar_(Public_Sector_University),_Khyber_Pakhtunkhwa,_Pakistan_cropped.jpg",
    "author": "Zafarmaini",
    "licence": "CC BY-SA 4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "Photo by Zafarmaini, via Wikimedia Commons — CC BY-SA 4.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  },
  {
    "slug": "multan",
    "landmark": "Shah Rukn-e-Alam",
    "source": "https://upload.wikimedia.org/wikipedia/commons/7/7c/Tomb_of_Shah_Rukn-e-Alam_2014-07-31.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Tomb_of_Shah_Rukn-e-Alam_2014-07-31.jpg",
    "author": "ZainShahid117",
    "licence": "CC BY-SA 3.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/3.0/",
    "attribution": "Photo by ZainShahid117, via Wikimedia Commons — CC BY-SA 3.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  },
  {
    "slug": "quetta",
    "landmark": "Hanna Lake",
    "source": "https://upload.wikimedia.org/wikipedia/commons/f/f2/Hanna_Lake_Quetta.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Hanna_Lake_Quetta.jpg",
    "author": "Aysafaran",
    "licence": "CC BY-SA 4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "Photo by Aysafaran, via Wikimedia Commons — CC BY-SA 4.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  },
  {
    "slug": "hyderabad",
    "landmark": "Talpur Tombs",
    "source": "https://upload.wikimedia.org/wikipedia/commons/d/df/Mir_Karam_Ali_Khan_Talpur_Tombs_were_restored_in_2016_1.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Mir_Karam_Ali_Khan_Talpur_Tombs_were_restored_in_2016_1.jpg",
    "author": "Waheed.chandio",
    "licence": "CC BY-SA 4.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "attribution": "Photo by Waheed.chandio, via Wikimedia Commons — CC BY-SA 4.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  },
  {
    "slug": "sialkot",
    "landmark": "Clock Tower",
    "source": "https://upload.wikimedia.org/wikipedia/commons/0/0d/Clock_Tower%2C_Sialkot_21.jpg",
    "commonsPage": "https://commons.wikimedia.org/wiki/File:Clock_Tower,_Sialkot_21.jpg",
    "author": "PakGuru99",
    "licence": "CC BY-SA 3.0",
    "licenceUrl": "https://creativecommons.org/licenses/by-sa/3.0/",
    "attribution": "Photo by PakGuru99, via Wikimedia Commons — CC BY-SA 3.0",
    "note": "Still copyleft: share-alike attaches to this cropped tile, not only to the original. Awaiting a Pexels replacement — Commons has no attribution-only photograph of this city, its Pakistani city set being almost entirely Wiki Loves Monuments, which is share-alike by contest rule."
  }
];

/**
 * The social card, at the size the crawlers actually ask for.
 *
 * The carousel tile is 560x480 — below Facebook's 600px floor and nowhere near the 1.91:1
 * they crop to — so a shared city page rendered a small card, or none. These are cut from
 * the same originals rather than upscaled from the tile, because upscaling a 560px crop to
 * 1200 is visibly soft on exactly the screens a link preview is looked at on.
 */
const SOCIAL = join(OUT, 'social');
mkdirSync(SOCIAL, { recursive: true });

let ok = 0;
const credits = [];
for (const city of cities) {
  const { slug, landmark, local, source } = city;
  try {
    // A local source is an image this repository already ships and has already cleared.
    const buf = local
      ? readFileSync(join(process.cwd(), 'apps/web/public', local.slice(1)))
      : await fetch(source, { headers: { 'User-Agent': UA } }).then(async (res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return Buffer.from(await res.arrayBuffer());
        });
    await sharp(buf)
      .resize(560, 480, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(OUT, `${slug}.jpg`));
    await sharp(buf)
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(SOCIAL, `${slug}.jpg`));
    credits.push({
      file: `/cities/${slug}.jpg`,
      social: `/cities/social/${slug}.jpg`,
      landmark,
      source,
      ...(city.sourceDescription ? { sourceDescription: city.sourceDescription } : {}),
      ...(city.commonsPage ? { commonsPage: city.commonsPage } : {}),
      ...(city.author ? { author: city.author } : {}),
      licence: city.licence,
      licenceUrl: city.licenceUrl,
      attribution: city.attribution,
      ...(city.note ? { note: city.note } : {}),
    });
    ok++;
    console.log(
      '  ✓',
      `${slug}.jpg + social/${slug}.jpg`,
      `— ${landmark} (${(buf.length / 1024).toFixed(0)} KB source)`,
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
 * for production" since it was written, and until now nothing did — so the claim was not
 * checkable from the repository. It is now, in the same shape `public/blog/CREDITS.json`
 * uses for the article photographs.
 */
writeFileSync(
  join(OUT, 'CREDITS.json'),
  `${JSON.stringify(
    {
      licence:
        'Mixed, and deliberately recorded as such. Four tiles come from Pexels photographs this repository already ships for the blog — free for commercial use, no attribution, no share-alike. The remaining six are Wikimedia Commons originals and are still copyleft: the tiles are cropped re-encodes, which makes them derivative works, so the share-alike terms attach to the tiles themselves. Credits are rendered at /credits.',
      note: 'Re-encoded to JPEG: a 560x480 carousel tile and a 1200x630 social card, both smart-cropped from the full-resolution original.',
      images: credits,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `\n${ok}/${cities.length} cities written to apps/web/public/cities/ (tile + social card), attribution in CREDITS.json`,
);
