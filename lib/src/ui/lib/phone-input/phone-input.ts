import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  effect,
  signal,
  inject,
  input,
  model,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ControlContainer, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgxMaterialIntlTelInputComponent, CountryISO } from 'ngx-material-intl-tel-input';
import { PhoneNumberFormat } from 'google-libphonenumber';

class NullControlContainer extends ControlContainer {
  override get control(): AbstractControl { return new FormGroup({}); }
  override get path(): string[] { return []; }
}

const PREFERRED: CountryISO[] = [
  CountryISO.Pakistan,
  CountryISO.India,
  CountryISO.UnitedArabEmirates,
  CountryISO.SaudiArabia,
  CountryISO.Qatar,
  CountryISO.Kuwait,
  CountryISO.Bahrain,
  CountryISO.Oman,
  CountryISO.Bangladesh,
  CountryISO.UnitedKingdom,
];

/**
 * Phone input wrapping ngx-material-intl-tel-input.
 * Outputs E.164 formatted number via the `phone` model.
 *
 *   `<hh-phone-input [(phone)]="phone" [error]="err" label="Phone" />`
 */
@Component({
  selector: 'hh-phone-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, NgxMaterialIntlTelInputComponent, TranslocoPipe],
  providers: [{ provide: ControlContainer, useClass: NullControlContainer }],
  // Any focus inside the field counts as the user arriving — see `onValue`.
  host: { '(focusin)': 'touched.set(true)' },
  styles: [`
    /* ── Outer pill container ──────────────────────────────────────── */
    hh-phone-input {
      display: block;

      /* lib design tokens → our design system */
      --mat-filled-tel-form-outline-width: 1px;
      --mat-filled-tel-form-outline-color: #CFCFCF;
      --mat-filled-tel-form-container-shape: 12px;
      --mat-filled-tel-form-background: #ffffff;
      --mat-filled-tel-form-hover-background: #ffffff;
      --mat-filled-tel-form-focus-outline-color: #F47C3F;
      --mat-filled-tel-form-focus-background: #ffffff;

      /* inner filled field tokens */
      --mdc-filled-text-field-container-color: transparent;
      --mdc-filled-text-field-active-indicator-color: transparent;
      --mdc-filled-text-field-focus-active-indicator-color: transparent;
      --mdc-filled-text-field-hover-active-indicator-color: transparent;
      --mdc-filled-text-field-active-indicator-height: 0px;
      --mdc-filled-text-field-input-text-color: #141414;
      --mdc-filled-text-field-input-text-placeholder-color: #7A7A7A;
      --mdc-filled-text-field-label-text-color: transparent;
      --mdc-filled-text-field-focus-label-text-color: transparent;
      --mdc-filled-text-field-hover-label-text-color: transparent;
      --mat-form-field-container-height: 42px;
      --mat-form-field-filled-with-label-container-padding-top: 0px;
      --mat-form-field-filled-with-label-container-padding-bottom: 0px;

      /* mat-select tokens */
      --mat-select-trigger-text-color: #141414;
      --mat-select-placeholder-text-color: #7A7A7A;
      --mat-select-arrow-color: #7A7A7A;
      --mat-select-focused-arrow-color: #F47C3F;
    }

    /* Error state */
    hh-phone-input.hh-phone--error section .tel-form {
      border-color: #E74C3C !important;
      outline: none !important;
    }

    /* ── Kill the ripple underline ─────────────────────────────────── */
    hh-phone-input .mdc-line-ripple { display: none !important; }

    /* ── Strip top padding reserved for floating label ─────────────── */
    hh-phone-input .mat-mdc-text-field-wrapper.mdc-text-field {
      padding-top: 0 !important;
    }
    hh-phone-input .mat-mdc-form-field-infix {
      padding-top: 9px !important;
      padding-bottom: 9px !important;
      min-height: 0 !important;
    }

    /* ── Select trigger ────────────────────────────────────────────── */
    hh-phone-input .mat-mdc-select-trigger {
      font-size: 13.5px;
    }
    hh-phone-input .mat-mdc-select-value-text {
      color: #141414;
    }
    hh-phone-input .mat-mdc-select-arrow svg {
      fill: #7A7A7A;
    }

    /* ── Phone number text input ───────────────────────────────────── */
    hh-phone-input .mat-mdc-input-element {
      font-size: 13.5px;
    }
    hh-phone-input .mat-mdc-input-element::placeholder {
      color: #7A7A7A;
    }

    /* ── Suffix icon right padding ──────────────────────────────────── */
    hh-phone-input .mat-mdc-form-field-icon-suffix {
      padding-right: 8px !important;
    }

    /* ── Hide the subscript wrapper inside each inner field ─────────── */
    hh-phone-input .mat-mdc-form-field-subscript-wrapper {
      display: none !important;
    }

    /* ── Hide library label — we render our own above ───────────────── */
    hh-phone-input mat-label.main-label { display: none !important; }

    /* ── Hide the hint row inside the section (we own error display) ── */
    hh-phone-input ngx-material-intl-tel-input section mat-hint {
      display: none !important;
    }

    /* ── Match hh-input height exactly (42px border-box) ───────────── */
    hh-phone-input .tel-form { height: 42px !important; box-sizing: border-box; }

    /* ── Error message (rendered below the pill) ────────────────────── */
    .hh-phone-error {
      margin-top: 4px;
      font-size: 12px;
      color: #E74C3C;
      display: flex;
      align-items: center;
      gap: 4px;
      line-height: 1.4;
    }
  `],
  template: `
    @if (label() !== '') {
      <label class="mb-1 block text-xs font-medium text-ink-600">{{ label() ?? ('common.phone' | transloco) }}</label>
    }
    <ngx-material-intl-tel-input
      [class.hh-phone--error]="!!error()"
      [fieldControl]="ctrl"
      [autoIpLookup]="false"
      [autoSelectCountry]="true"
      autoSelectedCountry="pk"
      [numberValidation]="true"
      [enableSearch]="true"
      [emojiFlags]="false"
      [preferredCountries]="preferred"
      [outputNumberFormat]="E164"
      appearance="fill"
      (currentValue)="onValue($event)"
    />
    @if (error()) {
      <p class="hh-phone-error">
        <i class="ti ti-alert-circle" aria-hidden="true"></i>{{ error() }}
      </p>
    }
  `,
})
export class PhoneInput {
  readonly phone = model('');
  readonly error = input('');
  readonly label = input<string | undefined>(undefined);

  protected readonly ctrl      = new FormControl('');
  protected readonly E164      = PhoneNumberFormat.E164;
  protected readonly preferred = PREFERRED;

  private readonly destroyRef = inject(DestroyRef);

  /** Whether anyone has actually put the cursor in this field. See {@link onValue}. */
  protected readonly touched = signal(false);

  constructor() {
    // Sync an externally-set phone value into the FormControl.
    effect(() => {
      const v = this.phone();
      if (v !== this.ctrl.value) this.ctrl.setValue(v, { emitEvent: false });
    });
  }

  /**
   * Accepts what the control reports — except an empty value nobody asked for.
   *
   * `ngx-material-intl-tel-input` emits `currentValue` while it initialises, before the
   * effect above has handed it the number, and that emission is an empty string. Taken at
   * face value it wrote '' straight back over the number the form had just loaded, so a
   * hostel profile opened and left alone reported itself as edited: `dirty()` was true on
   * arrival and the Update button was live before anybody typed.
   *
   * Gated on focus rather than on the control's own value, because the spurious emission
   * arrives during change detection and the effect flushes after it — any guard comparing
   * the two is racing them. Nobody clears a field they have not first put a cursor in.
   */
  protected onValue(val: string): void {
    const next = val ?? '';
    if (!next && !this.touched()) return;
    this.phone.set(next);
  }
}
