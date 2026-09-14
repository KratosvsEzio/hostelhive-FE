import { usableVariant } from './attachment-url';

/** Copied from a live `mark_as_primary` response, slash and all. */
const GOOD_URL =
  'https://hostel-hive-images.s3.ap-south-1.amazonaws.com/unprocessed/hostelhive/documents/4203a480-ffe8-4cd3-8594-7cdfe87f297c';
const MALFORMED_VARIANT =
  'https://hostel-hive-images.s3.ap-south-1.amazonaws.comhostelhive/documents/4203a480-ffe8-4cd3-8594-7cdfe87f297c/document.png';

describe('usableVariant', () => {
  /**
   * The defect this exists for, in the exact shape the server sends it.
   *
   * `PUT /api/attachments/:uuid/mark_as_primary` joins bucket to key without a separator, so
   * the host reads `amazonaws.comhostelhive` — not a 404, a name that does not resolve. It
   * parses as a perfectly valid URL, which is why nothing catches it by looking at the string
   * alone; what gives it away is that a rendition claims to live somewhere its own original
   * does not.
   */
  it('refuses a variant whose host is not the host the attachment lives on', () => {
    expect(usableVariant({ document: MALFORMED_VARIANT }, GOOD_URL)).toBeNull();
  });

  it('accepts one that is on the same host', () => {
    const ok = 'https://hostel-hive-images.s3.ap-south-1.amazonaws.com/x/thumb.png';

    expect(usableVariant({ thumb: ok }, GOOD_URL)).toBe(ok);
  });

  it('prefers the smallest rendition offered, since it is a thumbnail', () => {
    const host = 'https://hostel-hive-images.s3.ap-south-1.amazonaws.com';

    expect(
      usableVariant(
        { medium: `${host}/m.png`, thumb: `${host}/t.png`, small: `${host}/s.png` },
        GOOD_URL,
      ),
    ).toBe(`${host}/t.png`);
  });

  it('will take an unnamed rendition when none of the known sizes are there', () => {
    const odd = 'https://hostel-hive-images.s3.ap-south-1.amazonaws.com/odd.png';

    expect(usableVariant({ document: odd }, GOOD_URL)).toBe(odd);
  });

  /**
   * With nothing well-formed to compare against there is no judgement to make, so the first
   * candidate goes through. The point is to catch a known-bad shape, not to invent a policy
   * about addresses this app has never seen.
   */
  it('passes the first one through when there is no reference to check against', () => {
    expect(usableVariant({ document: MALFORMED_VARIANT }, null)).toBe(MALFORMED_VARIANT);
    expect(usableVariant({ document: MALFORMED_VARIANT }, 'not a url')).toBe(MALFORMED_VARIANT);
  });

  it('has nothing to offer when there are no variants', () => {
    expect(usableVariant(null, GOOD_URL)).toBeNull();
    expect(usableVariant(undefined, GOOD_URL)).toBeNull();
    expect(usableVariant({}, GOOD_URL)).toBeNull();
  });

  it('ignores empty strings rather than returning one as a photo', () => {
    expect(usableVariant({ thumb: '', small: '' }, GOOD_URL)).toBeNull();
  });

  /** Server data, so a value that is not a URL at all must not throw on the way past. */
  it('survives a variant that is not a URL', () => {
    expect(usableVariant({ thumb: 'nonsense' }, GOOD_URL)).toBeNull();
  });
});
