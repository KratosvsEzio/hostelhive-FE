import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslocoTesting } from '../../../testing/provide-transloco-testing';
import { FilterGroup, GlobalFilter } from './global-filter';

/**
 * The checkable options are real inputs, drawn over.
 *
 * They used to be a `<label>` carrying a click handler around two `<div>`s. That works for a
 * mouse and for nothing else: there is no tab stop, Space and Enter do nothing, and a screen
 * reader meets an unnamed run of text with no role and no checked state — so a filter panel
 * was unusable without a pointer. Restoring the native control under a visually-hidden class
 * (not `display:none`, which would take it out of the focus order again) gets the role, the
 * state, the keyboard and the label association back at once.
 *
 * These tests assert on the input rather than on the drawn box, because the input is the part
 * that was missing and the part assistive technology actually reads.
 */
const GROUPS: FilterGroup[] = [
  {
    key: 'status',
    label: 'Status',
    fields: [
      {
        key: 'state',
        type: 'checkbox',
        options: [
          { value: 'due', label: 'Due' },
          { value: 'paid', label: 'Paid' },
        ],
      },
      {
        key: 'scope',
        type: 'radio',
        options: [
          { value: 'all', label: 'All' },
          { value: 'mine', label: 'Mine' },
        ],
      },
    ],
  },
];

describe('GlobalFilter checkable options', () => {
  let fixture: ComponentFixture<GlobalFilter>;

  async function open(): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [GlobalFilter],
      providers: [provideTranslocoTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(GlobalFilter);
    fixture.componentRef.setInput('groups', GROUPS);
    fixture.detectChanges();

    // The panel is behind the trigger; nothing renders until it is open.
    const trigger = fixture.debugElement.query(By.css('button'));
    trigger.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const inputs = (type: string) =>
    fixture.debugElement
      .queryAll(By.css(`input[type=${type}]`))
      .map((d) => d.nativeElement as HTMLInputElement);

  it('renders a real checkbox for every option', async () => {
    await open();
    expect(inputs('checkbox').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the control in the focus order rather than hiding it outright', async () => {
    await open();
    const box = inputs('checkbox')[0];
    // `sr-only` clips it; `display:none` or `hidden` would remove the tab stop and the role,
    // which is the failure this whole change exists to undo.
    expect(box.className).toContain('sr-only');
    expect(box.hidden).toBe(false);
    expect(getComputedStyle(box).display).not.toBe('none');
  });

  it('associates each control with its label, so the option has a name', async () => {
    await open();
    const box = inputs('checkbox')[0];
    const label = box.closest('label');
    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBeTruthy();
  });

  it('groups the radios by name, which is what gives arrow-key navigation', async () => {
    await open();
    const radios = inputs('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(radios[0].name).toBeTruthy();
    expect(radios[0].name).toBe(radios[1].name);
  });

  it('toggles the draft value when the control is activated', async () => {
    await open();
    const box = inputs('checkbox')[0];
    expect(box.checked).toBe(false);

    box.click();
    fixture.detectChanges();

    expect(inputs('checkbox')[0].checked).toBe(true);
  });

  it('offers a focusable way to dismiss the panel', async () => {
    await open();
    // The click-outside backdrop was a bare div: no tab stop, so a keyboard user had no way
    // to close the panel at all.
    const backdrop = fixture.debugElement.query(By.css('button.fixed.inset-0'));
    expect(backdrop).not.toBeNull();
    expect((backdrop.nativeElement as HTMLButtonElement).getAttribute('aria-label')).toBeTruthy();
  });
});
