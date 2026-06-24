import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

interface Pref {
  label: string;
  desc: string;
  on: boolean;
}

@Component({
  selector: 'app-account-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.html',
})
export class AccountNotifications {
  protected readonly prefs = signal<Pref[]>([
    {
      label: 'New matching hostels',
      desc: 'When fresh listings match your saved search.',
      on: true,
    },
    {
      label: 'Price drops',
      desc: 'When a hostel you saved lowers its price.',
      on: true,
    },
    {
      label: 'Replies from hosts',
      desc: 'When a host responds to your enquiry.',
      on: true,
    },
    {
      label: 'Booking reminders',
      desc: 'Visit reminders and move-in checklists.',
      on: false,
    },
    {
      label: 'Tips & offers',
      desc: 'Occasional product news and promotions.',
      on: false,
    },
  ]);

  protected toggle(i: number): void {
    this.prefs.update((list) =>
      list.map((p, j) => (j === i ? { ...p, on: !p.on } : p)),
    );
  }
}
