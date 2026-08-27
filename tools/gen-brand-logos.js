const fs = require('fs');
const path = require('path');

const PUB = 'D:/GitHub/HostelHive/apps/web/public';
const OUT = 'D:/GitHub/HostelHive/apps/web/src/app/core/brand/brand-logos.ts';

/**
 * Takes the dark-ink file and makes its ink follow `currentColor`.
 *
 * The ink paths carry no class — they inherit the root fill — so setting `fill="currentColor"`
 * on <svg> is the whole trick. The orange keeps its own class and stays orange, which is the
 * point: the accent is brand, the ink is contextual.
 */
function toInline(file) {
  let svg = fs.readFileSync(path.join(PUB, file), 'utf8');

  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const body = svg
    .replace(/[\s\S]*?<style[^>]*>[\s\S]*?<\/style>/, '')   // drop Illustrator's style block
    .replace(/<\/svg>\s*$/, '')
    .trim();

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
    `fill="currentColor" focusable="false" aria-hidden="true">` +
    `<style>.st0{fill:#F36E21}</style>${body}</svg>`
  ).replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ');
}

const wordmark = toInline('hostelhive-logo.svg');
const mark = toInline('hostelhive-mark.svg');

const file = `/**
 * The brand marks, inline rather than fetched.
 *
 * They were \`<img src="/hostelhive-logo.svg">\` until the ink needed to change with the
 * surface. An \`<img>\` is an opaque document — CSS on the page cannot reach inside it — which
 * is why there used to be a white copy of every file, and before that a \`brightness-0 invert\`
 * filter on the footer that flipped the orange along with everything else.
 *
 * Inline, the ink paths inherit \`currentColor\`, so one definition serves every background:
 * \`text-ink-900\` in the header, \`text-white\` in the footer. The orange keeps its own fill and
 * never moves.
 *
 * Generated from apps/web/public/hostelhive-{logo,mark}.svg — those files stay, because the
 * favicon, the og:image and the invoice PDF all need a real URL to load rather than a string
 * to inline. Re-run the generator if the artwork changes; do not hand-edit the path data.
 */
export const BRAND_LOGOS = {
  /** Full wordmark — bed, "HOSTELHIVE", bee. */
  wordmark: '${wordmark.replace(/'/g, "\\'")}',
  /** Bed only, for widths the wordmark cannot survive. */
  mark: '${mark.replace(/'/g, "\\'")}',
} as const;

export type BrandLogo = keyof typeof BRAND_LOGOS;
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, file);
console.log('wrote', OUT);
console.log('  wordmark', wordmark.length, 'b');
console.log('  mark    ', mark.length, 'b');
console.log('  currentColor on root:', /fill="currentColor"/.test(wordmark));
console.log('  orange preserved:', /#F36E21/.test(wordmark));
