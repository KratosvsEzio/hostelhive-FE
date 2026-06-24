import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import {
  Avatar,
  Button,
  Card,
  Dropdown,
  DropdownOption,
  Input,
  Toggle,
} from '@hostelhive/ui';

/** A notification row with independent WhatsApp + email channels. */
interface NotificationPref {
  key: string;
  title: string;
  desc: string;
  whatsapp: boolean;
  email: boolean;
}

/**
 * Host · Settings (design-mockups/17-host-settings.html).
 * Pure form state held in signals — profile, payout details (+ invoice preview),
 * notification toggles, security, and a danger zone.
 */
@Component({
  selector: 'hh-host-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Avatar, Button, Card, Dropdown, Input, Toggle],
  templateUrl: './settings.html',
})
export class HostSettings {
  // Profile form state
  protected readonly fullName = signal('Imran Khan');
  protected readonly email = signal('imran@almadina.pk');
  protected readonly primaryPhone = signal('321 1234567');
  protected readonly secondaryPhone = signal('');

  // Payment instructions form state
  protected readonly methods = [
    'JazzCash',
    'EasyPaisa',
    'Bank transfer',
  ] as const;
  protected readonly methodOptions: DropdownOption[] = this.methods.map(
    (m) => ({ value: m, label: m }),
  );
  protected readonly payMethod = signal<string>('JazzCash');
  protected readonly payTitle = signal('Imran Khan');
  protected readonly payNumber = signal('0321-1234567');
  protected readonly payNote = signal(
    'Please share the receipt after payment.',
  );

  protected readonly invoicePreview = computed(() => {
    const note = this.payNote().trim();
    const base = `"Payment: ${this.payMethod()} ${this.payNumber()} (${this.payTitle()}).`;
    return note ? `${base} ${note}"` : `${base}"`;
  });

  // Notification preferences
  protected readonly notifications = signal<NotificationPref[]>([
    {
      key: 'billing-summary',
      title: 'Daily billing summary',
      desc: 'Sent after the midnight invoice run finishes',
      whatsapp: true,
      email: true,
    },
    {
      key: 'seeker-leads',
      title: 'New seeker leads',
      desc: 'Daily email digest of seekers who viewed your number',
      whatsapp: false,
      email: true,
    },
    {
      key: 'overdue-alerts',
      title: 'Overdue invoice alerts',
      desc: 'When a tenant invoice passes its due date',
      whatsapp: true,
      email: false,
    },
    {
      key: 'listing-status',
      title: 'Listing status updates',
      desc: 'Approved, changes requested, or rejected',
      whatsapp: false,
      email: true,
    },
  ]);

  protected setChannel(
    key: string,
    channel: 'whatsapp' | 'email',
    value: boolean,
  ): void {
    this.notifications.update((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [channel]: value } : r)),
    );
  }

  protected setPayMethod(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.payMethod.set(v);
  }
}
