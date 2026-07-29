import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ACCEPT_ATTR,
  PhotoGrid,
  PhotoGridPhoto,
  classifyImageFile,
  fileExtension,
  imageFormatLabel,
  imageMimeType,
} from './photo-grid';

const TEN_MB = 10 * 1024 * 1024;

function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('ACCEPT_ATTR', () => {
  it('lists extensions alongside the MIME types', () => {
    expect(ACCEPT_ATTR).toBe(
      'image/jpeg,image/png,image/avif,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.avif,.heic,.heif,.webp',
    );
  });
});

describe('fileExtension', () => {
  it('lower-cases the extension', () => {
    expect(fileExtension('Holiday.JPEG')).toBe('.jpeg');
  });

  it('returns an empty string when there is no extension', () => {
    expect(fileExtension('screenshot')).toBe('');
  });
});

describe('classifyImageFile', () => {
  it('accepts every allowed MIME type', () => {
    const mimes = [
      'image/jpeg',
      'image/png',
      'image/avif',
      'image/heic',
      'image/heif',
      'image/webp',
    ];
    for (const mime of mimes)
      expect(classifyImageFile(fakeFile('a.bin', mime), TEN_MB)).toBe('ok');
  });

  it('rejects gif', () => {
    expect(classifyImageFile(fakeFile('loop.gif', 'image/gif'), TEN_MB)).toBe('type');
  });

  it('falls back to the extension when the browser reports no MIME', () => {
    expect(classifyImageFile(fakeFile('IMG_0001.HEIC', ''), TEN_MB)).toBe('ok');
    expect(classifyImageFile(fakeFile('shot.avif', 'application/octet-stream'), TEN_MB)).toBe('ok');
  });

  it('does not accept a disallowed extension on an empty MIME', () => {
    expect(classifyImageFile(fakeFile('clip.gif', ''), TEN_MB)).toBe('type');
    expect(classifyImageFile(fakeFile('notes.pdf', ''), TEN_MB)).toBe('type');
  });

  it('reports an oversized file separately from a bad type', () => {
    expect(classifyImageFile(fakeFile('big.png', 'image/png', TEN_MB + 1), TEN_MB)).toBe('size');
  });

  it('prefers the type verdict when a file is both oversized and disallowed', () => {
    expect(classifyImageFile(fakeFile('big.gif', 'image/gif', TEN_MB + 1), TEN_MB)).toBe('type');
  });
});

describe('imageMimeType', () => {
  it('keeps a usable MIME as-is', () => {
    expect(imageMimeType(fakeFile('a.png', 'image/png'))).toBe('image/png');
  });

  it('derives the MIME from the extension when the browser reports none', () => {
    expect(imageMimeType(fakeFile('IMG_0001.HEIC', ''))).toBe('image/heic');
    expect(imageMimeType(fakeFile('a.jpg', 'application/octet-stream'))).toBe('image/jpeg');
  });

  it('falls back to a generic MIME when nothing identifies the file', () => {
    expect(imageMimeType(fakeFile('mystery', ''))).toBe('application/octet-stream');
  });
});

describe('imageFormatLabel', () => {
  it('uses the upper-cased extension', () => {
    expect(imageFormatLabel(fakeFile('IMG_0001.heic', ''))).toBe('HEIC');
  });

  it('falls back to the MIME subtype', () => {
    expect(imageFormatLabel(fakeFile('mystery', 'image/webp'))).toBe('WEBP');
  });
});

@Component({
  imports: [PhotoGrid],
  template: `<hh-photo-grid [photos]="photos()" [atLimit]="atLimit()" />`,
})
class GridHost {
  readonly photos = signal<PhotoGridPhoto[]>([]);
  readonly atLimit = signal(false);
}

describe('PhotoGrid', () => {
  function render() {
    const fixture = TestBed.createComponent(GridHost);
    fixture.detectChanges();
    return fixture;
  }

  it('swaps an undecodable preview for a placeholder tile naming the format', () => {
    const fixture = render();
    fixture.componentInstance.photos.set([
      { id: '1', url: 'blob:heic', primary: true, format: 'HEIC' },
    ]);
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css('img'));
    expect(img).not.toBeNull();
    img.triggerEventHandler('error', new Event('error'));
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('img'))).toBeNull();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('HEIC · preview unavailable');
  });

  it('keeps a decodable preview as an image', () => {
    const fixture = render();
    fixture.componentInstance.photos.set([
      { id: '1', url: 'blob:png', primary: true, format: 'PNG' },
    ]);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('img'))).not.toBeNull();
  });

  it('disables the add tile at the photo limit', () => {
    const fixture = render();
    const tile = () =>
      fixture.debugElement.query(By.css('button[type="button"]'))
        .nativeElement as HTMLButtonElement;
    expect(tile().disabled).toBe(false);

    fixture.componentInstance.atLimit.set(true);
    fixture.detectChanges();
    expect(tile().disabled).toBe(true);
    expect(tile().title).toContain('at most 10 photos');
  });
});
