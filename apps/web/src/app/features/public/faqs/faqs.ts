import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-faqs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './faqs.html',
})
export class Faqs {
  protected readonly open = signal<number | null>(null);

  protected toggle(index: number): void {
    this.open.update((current) => (current === index ? null : index));
  }

  protected readonly sections = [
    {
      title: 'For Students',
      items: [
        {
          q: 'How do I find a hostel on HostelHive?',
          a: 'Use the search bar on the homepage to enter your city or area. You can filter results by price range, room type, amenities, and more to find a hostel that fits your needs.',
        },
        {
          q: 'Are all hostels on the platform verified?',
          a: 'Yes. Every hostel listed on HostelHive goes through a verification process before it goes live. We confirm property details, ownership, and basic safety standards.',
        },
        {
          q: 'How do I book a hostel?',
          a: 'Once you find a hostel you like, click on the listing to view full details. You can then contact the host directly or submit a booking request through the platform.',
        },
        {
          q: 'How do I contact a hostel?',
          a: 'Open any listing and create a free account to reveal the host’s verified phone number, then call or WhatsApp them directly.',
        },
        {
          q: 'How do I save a hostel?',
          a: 'Tap the heart on any listing. Saved hostels appear under Favorites in your account.',
        },
        {
          q: 'Is there a fee for students to use HostelHive?',
          a: 'No. Searching, browsing, and contacting hosts is completely free for students.',
        },
        {
          q: 'Can I leave a review for a hostel?',
          a: 'Yes, but only after you have been a verified tenant. This ensures all reviews on the platform are genuine and trustworthy.',
        },
      ],
    },
    {
      title: 'For Hosts',
      items: [
        {
          q: 'How do I list my hostel on HostelHive?',
          a: 'Sign up for a host account, then follow the onboarding wizard to add your property details, rooms, pricing, and photos. Once submitted, our team will review and verify your listing.',
        },
        {
          q: 'What tools does HostelHive provide for hosts?',
          a: 'You get a full management dashboard including room management, tenant profiles, invoicing, utility bill splitting, mess management, expense tracking, and analytics — all in one place.',
        },
        {
          q: 'Is there a subscription fee for hosts?',
          a: 'HostelHive offers subscription plans for hosts. You can view available plans and pricing on the Subscription page after signing in as a host.',
        },
        {
          q: 'How does invoicing work?',
          a: 'You can generate rental and utility invoices directly from the dashboard. Invoices are tracked with due dates, payment status, and can be shared with tenants.',
        },
        {
          q: 'Can I manage multiple hostels?',
          a: 'Yes. You can add and switch between multiple properties from a single host account.',
        },
      ],
    },
    {
      title: 'Account & Security',
      items: [
        {
          q: 'How do I reset my password?',
          a: 'Click "Forgot password" on the login page, enter your email, and follow the instructions in the reset email we send you.',
        },
        {
          q: 'Is my personal information safe?',
          a: 'Absolutely. We follow strict data protection practices in compliance with Pakistani law. Read our Privacy Policy for full details on how we handle your data.',
        },
        {
          q: 'How do I delete my account?',
          a: 'Contact us at support@hostelhive.com with your account details and we will process your request.',
        },
      ],
    },
    {
      title: 'General',
      items: [
        {
          q: 'Which cities does HostelHive cover?',
          a: 'We are currently focused on major student cities across Pakistan including Lahore, Islamabad, Karachi, and Faisalabad, with more cities being added regularly.',
        },
        {
          q: 'How do I report a problem with a listing?',
          a: 'Use the report function on the listing page or contact us directly at support@hostelhive.com. We take all reports seriously and investigate promptly.',
        },
        {
          q: 'I have a question not listed here. How can I reach you?',
          a: 'Visit our Contact page or email us at support@hostelhive.com. We typically respond within 24 hours on business days.',
        },
      ],
    },
  ];
}
