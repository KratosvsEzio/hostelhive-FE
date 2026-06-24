// Builds compact TopoJSON boundary files for the "Explore Pakistan" drill-down map.
// Source: geoBoundaries (gbOpen, CC-BY 4.0 — commercial-safe; attribute "geoBoundaries").
// Pipeline: fetch simplified GeoJSON per admin level -> mapshaper simplify + keep only
// shapeName -> TopoJSON -> apps/web/public/geo/pak-adm{0..3}.json.
// Re-run:  node tools/build-pak-geo.mjs
import mapshaper from 'mapshaper';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'apps/web/public/geo');
mkdirSync(OUT, { recursive: true });

const REV = '9469f09'; // pinned geoBoundaries release commit
// geoBoundaries stores GeoJSON via Git LFS, so use the media (LFS) endpoint, not raw.
const url = (lvl) =>
  `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${REV}/releaseData/gbOpen/PAK/${lvl}/geoBoundaries-PAK-${lvl}_simplified.geojson`;

// [level, visvalingam keep-% — lower = smaller/coarser]
const levels = [
  ['ADM0', 7],
  ['ADM1', 11],
  ['ADM2', 8],
  ['ADM3', 5],
];

for (const [lvl, pct] of levels) {
  try {
    const res = await fetch(url(lvl), {
      headers: { 'User-Agent': 'HostelHiveBot/1.0 (map data build)' },
    });
    if (!res.ok) {
      console.error('  ✗', lvl, '->', res.status);
      continue;
    }
    const geo = await res.text();
    const cmd =
      `-i in.json -simplify visvalingam ${pct}% keep-shapes ` +
      `-filter-fields shapeName -rename-layers data ` +
      `-o format=topojson out.json`;
    const output = await mapshaper.applyCommands(cmd, { 'in.json': geo });
    const topo = output['out.json'];
    const file = `pak-${lvl.toLowerCase()}.json`;
    writeFileSync(join(OUT, file), topo);
    console.log(
      '  ✓',
      file,
      `(${(topo.length / 1024).toFixed(0)} KB, src ${(geo.length / 1024).toFixed(0)} KB)`,
    );
  } catch (e) {
    console.error('  ✗', lvl, '->', e.message);
  }
}
console.log('\nDone -> apps/web/public/geo/');
