import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { RoomImage } from '@util/room-types';
import { RoomTypeRow } from './room-type-row';

function image(id: string): RoomImage {
  return { id, url: `https://example.test/${id}.jpg` };
}

describe('RoomTypeRow photos', () => {
  let fixture: ComponentFixture<RoomTypeRow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomTypeRow],
      providers: [provideI18nTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomTypeRow);
    fixture.componentRef.setInput('alwaysOpen', true);
    fixture.detectChanges();
  });

  function picker(): PhotoPicker {
    return fixture.debugElement.query(By.directive(PhotoPicker)).componentInstance;
  }

  function shownError(): string {
    return fixture.debugElement.query(By.css('p.text-danger'))?.nativeElement.textContent.trim() ?? '';
  }

  it('opens the picker on every free slot', () => {
    expect(picker().maxFiles()).toBe(3);

    fixture.componentRef.setInput('images', [image('a'), image('b')]);
    fixture.detectChanges();

    expect(picker().maxFiles()).toBe(1);
  });

  it('lets the parent count the slots, since only it knows about uploads in flight', () => {
    fixture.componentRef.setInput('images', []);
    fixture.componentRef.setInput('freeSlots', 1);
    fixture.detectChanges();

    // Two photos are on their way up, so one slot is free even though none has landed.
    expect(picker().maxFiles()).toBe(1);
  });

  it('keeps the picker’s rejection after the pick that removed the picker', () => {
    picker().rejected.emit('2 files skipped — Only one more photo fits.');
    // The pick that overflows is the one that fills the row, and a full row has no picker.
    fixture.componentRef.setInput('images', [image('a'), image('b'), image('c')]);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(PhotoPicker))).toBeNull();
    expect(shownError()).toBe('2 files skipped — Only one more photo fits.');
  });

  it('drops a stale rejection once a slot is free again', () => {
    picker().rejected.emit('1 file skipped — Only one more photo fits.');
    fixture.detectChanges();
    expect(shownError()).not.toBe('');

    const removed: string[] = [];
    fixture.componentInstance.imageRemoved.subscribe((id) => removed.push(id));
    fixture.componentRef.setInput('images', [image('a')]);
    fixture.detectChanges();
    fixture.debugElement.query(By.css('button[aria-label]')).nativeElement.click();
    fixture.detectChanges();

    expect(removed).toEqual(['a']);
    expect(shownError()).toBe('');
  });

  it('shows the parent’s upload failure as well', () => {
    fixture.componentRef.setInput('imageError', 'That photo could not be uploaded.');
    fixture.detectChanges();

    expect(shownError()).toBe('That photo could not be uploaded.');
  });
});
