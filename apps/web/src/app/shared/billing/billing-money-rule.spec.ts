import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Money is a decimal string from the server and is only ever formatted for display with
 * `billingMoney`; nothing in the billing screens converts, adds up or compares it. This scan
 * guards that rule in the files the saved card and Safepay Subscriptions work added.
 *
 * What it scans: each file's source with comments removed. For TypeScript, quoted strings are
 * blanked first so copy cannot trigger it (backtick templates are kept, since inline templates
 * hold real expressions). It reports:
 *  - a number conversion call: `Number(`, `parseFloat(`, `parseInt(`, `BigInt(`, `.toFixed(`
 *  - a unary plus (`+value`) written where an operand is expected
 *  - `* 100` / `/ 100` style minor-unit scaling
 *  - (TypeScript only) a `+ - * /` operator next to an identifier named amount, total or price
 *
 * What it ignores: time arithmetic such as `ms / DAY_MS`, logical `&&`, arrow `=>`, and
 * `??` fallbacks, none of which touch an amount.
 */
const CALLS = /\b(?:Number|parseFloat|parseInt|BigInt)\s*\(|\.toFixed\s*\(/;
const UNARY_PLUS = /(?:^|[=(,:?[]|\breturn|\|\||&&)\s*\+\s*[A-Za-z_$(]/m;
const SCALING = /[*/]\s*100\b|\b100\s*[*/]/;
const MONEY = String.raw`(?:[\w$]+\??\.)*[\w$]*(?:amount|total|price)[\w$]*(?:\??\.[\w$]+)*`;
const MONEY_OPERAND_LEFT = new RegExp(String.raw`\b${MONEY}\s*[-+*/](?![-+*/=>])`, 'i');
const MONEY_OPERAND_RIGHT = new RegExp(
  String.raw`(?<![-+*/=>])[-+*/]\s*${MONEY}`,
  'i',
);

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function blankStrings(source: string): string {
  return source.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
}

/** The rules a source breaks, by name; empty when it does no money arithmetic. */
export function moneyArithmetic(source: string, kind: 'ts' | 'html'): string[] {
  const text =
    kind === 'ts'
      ? blankStrings(stripComments(source))
      : stripComments(source);
  const found: string[] = [];
  if (CALLS.test(text)) found.push('number conversion');
  if (kind === 'ts' && UNARY_PLUS.test(text)) found.push('unary plus');
  if (SCALING.test(text)) found.push('minor-unit scaling');
  if (
    kind === 'ts' &&
    (MONEY_OPERAND_LEFT.test(text) || MONEY_OPERAND_RIGHT.test(text))
  ) {
    found.push('operator on an amount');
  }
  return found;
}

describe('moneyArithmetic', () => {
  it.each([
    ['Number(plan.amount_due_now)', 'number conversion'],
    ['const n = parseFloat(invoice.total);', 'number conversion'],
    ['label = amount.toFixed(2);', 'number conversion'],
    ['const n = +plan.price;', 'unary plus'],
    ['foo(+open_invoice.total)', 'unary plus'],
    ['return +amount;', 'unary plus'],
    ['const cents = total * 100;', 'minor-unit scaling'],
    ['const major = minor / 100;', 'minor-unit scaling'],
    ['const sum = plan.amount_due_now + invoice.total;', 'operator on an amount'],
    ['const half = invoice?.total / 2;', 'operator on an amount'],
    ['const diff = limit - plan.price;', 'operator on an amount'],
  ])('flags %s', (code, rule) => {
    expect(moneyArithmetic(code, 'ts')).toContain(rule);
  });

  it.each([
    'const left = end - nowMs;',
    'return { unit: "day", value: Math.floor(ms / DAY_MS) };',
    'const renews = plan.price && subscription?.current_period_end;',
    'const amount = plan.amount_due_now ?? undefined;',
    'items.map((amount) => amount.id);',
    'const label = "Pay " + count;',
    "const key = 'total * 100';",
    '// the total / 100 is never taken here',
    '/* Number(amount) is what we avoid */ const x = 1;',
    'const x = a ? b : c;',
  ])('lets %s through', (code) => {
    expect(moneyArithmetic(code, 'ts')).toEqual([]);
  });

  it('flags a conversion or scaling inside a template binding', () => {
    expect(moneyArithmetic('{{ Number(plan.price) }}', 'html')).toEqual([
      'number conversion',
    ]);
    expect(moneyArithmetic('{{ total / 100 }}', 'html')).toEqual([
      'minor-unit scaling',
    ]);
    expect(
      moneyArithmetic('<i data-field="auto-charge" class="a-total-b"></i>', 'html'),
    ).toEqual([]);
  });
});

describe('the billing files', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const subscription = '../../features/host/subscription';

  it.each([
    [`${subscription}/saved-card.ts`, 'ts'],
    [`${subscription}/billing-return.ts`, 'ts'],
    [`${subscription}/billing-return-states.ts`, 'ts'],
    [`${subscription}/payment-step.ts`, 'ts'],
    [`${subscription}/payment-due.ts`, 'ts'],
    [`${subscription}/billing-page.ts`, 'ts'],
    ['./billing-labels.ts', 'ts'],
    ['./billing-banner.ts', 'ts'],
    [`${subscription}/billing-page.html`, 'html'],
    [`${subscription}/payment-step.html`, 'html'],
  ] as const)('%s does no money arithmetic', (file, kind) => {
    const source = readFileSync(join(here, file), 'utf8');

    expect(source.length).toBeGreaterThan(0);
    expect(moneyArithmetic(source, kind)).toEqual([]);
  });
});
