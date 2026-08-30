import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { IMAGE_TYPE_MESSAGE } from '@hostelhive/ui';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PhotoPicker } from './photo-picker';

/** The component's members are `protected`; the spec drives them through this shape. */
interface PhotoPickerInternals {
  onFileInput(event: Event): void;
  onDrop(event: DragEvent): void;
  toggleMenu(event: Event): void;
  displayError(): string;
}

function imageFile(name: string, type = 'image/png', size = 1024): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const png = (name = 'a.png') => imageFile(name);
const gif = () => imageFile('a.gif', 'image/gif');
const huge = () => imageFile('big.png', 'image/png', 11 * 1024 * 1024);

/** A `FileList` as far as anything that iterates one is concerned. */
function fileList(files: File[]): FileList {
  return Object.assign(files.slice(), {
    item: (i: number) => files[i] ?? null,
  }) as unknown as FileList;
}

/**
 * A file input that empties itself the way a real one does.
 *
 * `input.files` is a live view of the selection, so `input.value = ''` clears the list a
 * caller is already holding — the handler has to copy the files out before it resets. A stub
 * whose `files` is a plain array cannot fail that way, which is how a handler that reset first
 * and read second passed its tests and picked up nothing in a browser.
 */
function liveFileInput(files: File[]): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  const selection = fileList(files);
  Object.defineProperty(input, 'files', { get: () => selection });
  Object.defineProperty(input, 'value', {
    get: () => (selection.length ? `C:\\fakepath\\${selection[0].name}` : ''),
    // Emptied in place, not swapped for a fresh empty list: that is what makes a reference
    // taken a moment earlier go empty too, and it is the whole point of this stub.
    set: () => {
      (selection as unknown as File[]).length = 0;
    },
  });
  return input;
}

describe('PhotoPicker', () => {
  let fixture: ComponentFixture<PhotoPicker>;
  let picked: File[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoPicker],
      providers: [provideI18nTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PhotoPicker);
    picked = [];
    fixture.componentInstance.picked.subscribe((f) => picked.push(f));
    fixture.detectChanges();
  });

  function internals(): PhotoPickerInternals {
    return fixture.componentInstance as unknown as PhotoPickerInternals;
  }

  /** Drives the "choose from files" path with an input that behaves like the DOM's. */
  function choose(files: File[]): void {
    internals().onFileInput({ target: liveFileInput(files) } as unknown as Event);
    fixture.detectChanges();
  }

  function drop(files: File[]): void {
    internals().onDrop({
      preventDefault: () => undefined,
      dataTransfer: { files: fileList(files) },
    } as unknown as DragEvent);
    fixture.detectChanges();
  }

  function error(): string {
    return internals().displayError();
  }

  it('reads the selection before the reset that empties it', () => {
    fixture.componentRef.setInput('maxFiles', 3);
    const input = liveFileInput([png('one.png'), png('two.png')]);

    internals().onFileInput({ target: input } as unknown as Event);

    // Both halves matter: the files survive the reset, and the reset still happens — without
    // it the same photo cannot be picked again after a rejection.
    expect(picked.map((f) => f.name)).toEqual(['one.png', 'two.png']);
    expect(input.files?.length).toBe(0);
  });

  it('takes one photo unless told otherwise, and says what it left behind', () => {
    choose([png('one.png'), png('two.png'), png('three.png')]);

    expect(picked).toHaveLength(1);
    expect(picked[0].name).toBe('one.png');
    expect(error()).toBe('2 files skipped — Only one more photo fits.');
  });

  it('fills every free slot in one trip', () => {
    fixture.componentRef.setInput('maxFiles', 3);

    choose([png('one.png'), png('two.png'), png('three.png')]);

    expect(picked.map((f) => f.name)).toEqual(['one.png', 'two.png', 'three.png']);
    expect(error()).toBe('');
  });

  it('stops at the number of slots actually left', () => {
    fixture.componentRef.setInput('maxFiles', 2);

    choose([png('one.png'), png('two.png'), png('three.png')]);

    expect(picked.map((f) => f.name)).toEqual(['one.png', 'two.png']);
    expect(error()).toBe('1 file skipped — Only 2 more photos fit.');
  });

  it('does not let one rejected file cost the good ones it was picked with', () => {
    fixture.componentRef.setInput('maxFiles', 3);

    choose([png('one.png'), gif(), png('two.png')]);

    expect(picked.map((f) => f.name)).toEqual(['one.png', 'two.png']);
    expect(error()).toBe(`1 file skipped — ${IMAGE_TYPE_MESSAGE}`);
  });

  it('names both reasons when a batch fails two different ways', () => {
    fixture.componentRef.setInput('maxFiles', 3);

    choose([png('one.png'), gif(), huge()]);

    expect(picked.map((f) => f.name)).toEqual(['one.png']);
    expect(error()).toBe(
      `2 files skipped — ${IMAGE_TYPE_MESSAGE} That image is too large.`,
    );
  });

  it('gives the bare reason when nothing survives, as a single pick always did', () => {
    choose([gif()]);

    expect(picked).toEqual([]);
    expect(error()).toBe(IMAGE_TYPE_MESSAGE);
  });

  it('says nothing and emits nothing when the dialog is cancelled', () => {
    choose([]);

    expect(picked).toEqual([]);
    expect(error()).toBe('');
  });

  it('screens a drop by the same rules as the dialog', () => {
    fixture.componentRef.setInput('maxFiles', 3);

    drop([png('one.png'), gif(), png('two.png'), png('three.png')]);

    expect(picked.map((f) => f.name)).toEqual(['one.png', 'two.png']);
    expect(error()).toBe(`2 files skipped — Only 3 more photos fit. ${IMAGE_TYPE_MESSAGE}`);
  });

  it('reports what it turned away, after the files it accepted', () => {
    fixture.componentRef.setInput('maxFiles', 1);
    const order: string[] = [];
    fixture.componentInstance.picked.subscribe(() => order.push('picked'));
    fixture.componentInstance.rejected.subscribe((m) => order.push(m));

    choose([png('one.png'), png('two.png')]);

    // Rejection last, so a parent clearing its copy on `picked` cannot wipe this pick's reason.
    expect(order).toEqual(['picked', '1 file skipped — Only one more photo fits.']);
  });

  it('stays quiet when every file was taken', () => {
    fixture.componentRef.setInput('maxFiles', 2);
    const rejections: string[] = [];
    fixture.componentInstance.rejected.subscribe((m) => rejections.push(m));

    choose([png('one.png'), png('two.png')]);

    expect(rejections).toEqual([]);
  });

  it('offers a multi-select dialog only when more than one slot is free', () => {
    internals().toggleMenu({ stopPropagation: () => undefined } as unknown as Event);
    fixture.detectChanges();

    const input = (): HTMLInputElement =>
      fixture.debugElement.query(By.css('input[type=file]')).nativeElement;
    expect(input().multiple).toBe(false);

    fixture.componentRef.setInput('maxFiles', 3);
    fixture.detectChanges();
    expect(input().multiple).toBe(true);
  });
});
