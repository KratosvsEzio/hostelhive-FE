import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-account-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './help.html',
})
export class AccountHelp {
  protected readonly faqs = [
    {
      q: 'How do I contact a hostel?',
      a: 'Open any listing and create a free account to reveal the host’s verified phone number, then call or WhatsApp them directly.',
    },
    {
      q: 'Are the listings verified?',
      a: 'Listings marked “Verified” have been reviewed by our moderation team for accurate photos, pricing and contact details.',
    },
    {
      q: 'Is there any booking fee?',
      a: 'No. HostelHive is free for seekers — you arrange the stay directly with the host. Hosts pay for a listing subscription.',
    },
    {
      q: 'How do I save a hostel?',
      a: 'Tap the heart on any listing. Saved hostels appear under Favorites in your account.',
    },
  ];
}
