import { screenPickedPhotos, screenReplacementPhoto } from './photo-picker';

const TEN_MB = 10 * 1024 * 1024;
const TYPE_MESSAGE = 'JPG, PNG, WebP, AVIF or HEIC images only.';
const SIZE_MESSAGE = 'Images must be under 10 MB.';
const LIMIT_MESSAGE = 'A hostel can have at most 10 photos — remove one before adding more.';

function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const png = () => fakeFile('a.png', 'image/png');
const gif = () => fakeFile('a.gif', 'image/gif');
const huge = () => fakeFile('big.png', 'image/png', TEN_MB + 1);

describe('screenPickedPhotos', () => {
  it('accepts a clean batch without an error', () => {
    const result = screenPickedPhotos([png(), png()], 0);
    expect(result.accepted).toHaveLength(2);
    expect(result.error).toBeNull();
  });

  it('accepts webp and rejects gif', () => {
    const result = screenPickedPhotos([fakeFile('a.webp', 'image/webp'), gif()], 0);
    expect(result.accepted).toHaveLength(1);
    expect(result.error).toBe(`1 file skipped — ${TYPE_MESSAGE}`);
  });

  it('reports the bare reason when nothing survives', () => {
    expect(screenPickedPhotos([gif(), gif()], 0).error).toBe(TYPE_MESSAGE);
  });

  it('counts the skipped files when the batch is mixed', () => {
    const result = screenPickedPhotos([png(), gif(), gif()], 0);
    expect(result.accepted).toHaveLength(1);
    expect(result.error).toBe(`2 files skipped — ${TYPE_MESSAGE}`);
  });

  it('keeps the size reason distinct from the type reason', () => {
    expect(screenPickedPhotos([huge()], 0).error).toBe(SIZE_MESSAGE);
    expect(screenPickedPhotos([gif(), huge()], 0).error).toBe(
      `${TYPE_MESSAGE} ${SIZE_MESSAGE}`,
    );
  });

  it('rejects an over-limit batch whole rather than truncating it', () => {
    const result = screenPickedPhotos([png(), png()], 9);
    expect(result.accepted).toEqual([]);
    expect(result.error).toBe(LIMIT_MESSAGE);
  });

  it('allows a batch that lands exactly on the limit', () => {
    expect(screenPickedPhotos([png()], 9).accepted).toHaveLength(1);
  });

  it('rejects any pick once the limit is already reached', () => {
    expect(screenPickedPhotos([png()], 10).error).toBe(LIMIT_MESSAGE);
  });
});

describe('screenReplacementPhoto', () => {
  it('ignores the photo limit', () => {
    const result = screenReplacementPhoto(png(), TEN_MB);
    expect(result.accepted).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it('reports the reason a replacement was rejected', () => {
    expect(screenReplacementPhoto(gif()).error).toBe(TYPE_MESSAGE);
    expect(screenReplacementPhoto(huge()).error).toBe(SIZE_MESSAGE);
  });
});
