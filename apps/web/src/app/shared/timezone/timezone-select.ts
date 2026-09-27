import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { Dropdown, DropdownOption } from '@hostelhive/ui';
import { allTimeZones, zoneOffsetLabel } from '@util/time-zones';

/** Built once: the list does not change while the page is open, and ~420 offsets are not free. */
let cachedOptions: DropdownOption[] | null = null;
function zoneOptions(): DropdownOption[] {
  if (!cachedOptions) {
    cachedOptions = allTimeZones().map((zone) => {
      const offset = zoneOffsetLabel(zone);
      return { value: zone, label: offset ? `${zone.replace(/_/g, ' ')} (${offset})` : zone.replace(/_/g, ' ') };
    });
  }
  return cachedOptions;
}

/**
 * Shareable time zone picker — a searchable dropdown of IANA zones labelled with their current
 * offset, "Asia/Karachi (GMT+5)". Two-way bound to the IANA name, which is what the API takes.
 *
 * Search matches the label, so "karachi", "lisbon" or "gmt+5" all narrow it. A value the list
 * does not hold (a zone this engine does not know) is still shown rather than dropped, so an
 * existing hostel never appears to have lost its zone.
 *
 * `<hh-timezone-select [(value)]="timezone" />`
 */
@Component({
  selector: 'hh-timezone-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
  template: `
    <hh-dropdown
      [controlId]="controlId()"
      variant="field"
      size="md"
      placeholder="Select a time zone"
      [options]="filteredOptions()"
      [value]="value()"
      [searchable]="true"
      searchPlaceholder="Search a city or offset"
      emptyLabel="No time zone matches"
      [disabled]="disabled()"
      [error]="error()"
      (valueChange)="onChange($event)"
      (searchChange)="query.set($event)"
    />
  `,
})
export class TimezoneSelect {
  /** Selected IANA zone (two-way bindable via `[(value)]`). */
  readonly value = model<string | null>(null);
  /** Forwarded to the trigger, so a <label for> outside can name this field. */
  readonly controlId = input('');
  readonly disabled = input(false);
  readonly error = input('');

  protected readonly query = signal('');

  protected readonly filteredOptions = computed<DropdownOption[]>(() => {
    const all = zoneOptions();
    const current = this.value();
    const withCurrent =
      current && !all.some((o) => o.value === current) ? [{ value: current, label: current }, ...all] : all;
    const q = this.query().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q) return withCurrent;
    return withCurrent.filter((o) => o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q.replace(/ /g, '_')));
  });

  protected onChange(v: string | string[] | null): void {
    const next = Array.isArray(v) ? (v[0] ?? null) : v;
    this.value.set(next);
  }
}
