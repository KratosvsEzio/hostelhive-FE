// Downloads each city's landmark photo from Wikimedia Commons (full-size original),
// smart-crops + resizes to a hex-friendly tile, and bundles it under
// apps/web/public/cities/ so the carousel works offline (Capacitor) and fast.
// Source images are CC-licensed on Wikimedia Commons — keep attribution for production.
// Re-run with:  node tools/fetch-city-images.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps/web/public/cities');
mkdirSync(OUT, { recursive: true });

const UA =
  'HostelHiveBot/1.0 (landing page city tiles; contact: dev@hostelhive.pk)';

// [slug, landmark, full-resolution Wikimedia Commons original URL]
const cities = [
  [
    'karachi',
    'Mazar-e-Quaid',
    'https://upload.wikimedia.org/wikipedia/commons/4/47/PK_Karachi_asv2020-02_img52_Mazar-e-Quaid.jpg',
  ],
  [
    'lahore',
    'Badshahi Mosque',
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Badshahi_Mosque_front_picture.jpg',
  ],
  [
    'islamabad',
    'Faisal Mosque',
    'https://upload.wikimedia.org/wikipedia/commons/e/e0/Ali_Mujtaba_WLM2017_FAISAL_MOSQUE_019.jpg',
  ],
  [
    'rawalpindi',
    'Railway Station',
    'https://upload.wikimedia.org/wikipedia/commons/7/7d/Rawalpindi_railway_station_4.JPG',
  ],
  [
    'faisalabad',
    'Clock Tower',
    'https://upload.wikimedia.org/wikipedia/commons/f/f1/Clock_Tower_Faisalabad_by_Usman_Nadeem.jpg',
  ],
  [
    'peshawar',
    'Islamia College',
    'https://upload.wikimedia.org/wikipedia/commons/a/ab/Islamia_College_Peshawar_%28Public_Sector_University%29%2C_Khyber_Pakhtunkhwa%2C_Pakistan_cropped.jpg',
  ],
  [
    'multan',
    'Shah Rukn-e-Alam',
    'https://upload.wikimedia.org/wikipedia/commons/7/7c/Tomb_of_Shah_Rukn-e-Alam_2014-07-31.jpg',
  ],
  [
    'quetta',
    'Hanna Lake',
    'https://upload.wikimedia.org/wikipedia/commons/f/f2/Hanna_Lake_Quetta.jpg',
  ],
  [
    'hyderabad',
    'Talpur Tombs',
    'https://upload.wikimedia.org/wikipedia/commons/d/df/Mir_Karam_Ali_Khan_Talpur_Tombs_were_restored_in_2016_1.jpg',
  ],
  [
    'sialkot',
    'Clock Tower',
    'https://upload.wikimedia.org/wikipedia/commons/0/0d/Clock_Tower%2C_Sialkot_21.jpg',
  ],
];

let ok = 0;
for (const [slug, landmark, url] of cities) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error('  ✗', slug, '->', res.status, res.statusText);
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
      `— ${landmark} (${(buf.length / 1024).toFixed(0)} KB source)`,
    );
  } catch (e) {
    console.error('  ✗', slug, '->', e.message);
  }
}
console.log(
  `\n${ok}/${cities.length} city tiles written to apps/web/public/cities/`,
);
