import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Container } from '@hostelhive/ui';

/**
 * "A safer way to find your stay": four promises, each card opening on a small picture of the
 * thing it promises (the approval steps, the filters, the host's number, the bill).
 */
@Component({
  selector: 'app-home-why',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [TranslocoPipe, Container],
  templateUrl: './home-why.html',
  styleUrl: './home-why.scss',
})
export class HomeWhy {
  protected readonly features = [
    {
      title: 'Every listing verified',
      desc: 'Each hostel is checked and approved before it goes live — what you see is real.',
    },
    {
      title: 'Filter that fits you',
      desc: 'Narrow by budget, gender, room sharing and amenities to find your exact match.',
    },
    {
      title: 'Direct verified contacts',
      desc: 'Unlock real phone numbers and reach hosts directly — no middlemen, no markup.',
    },
    {
      title: 'Safe & transparent',
      desc: 'Clear pricing, honest photos and reviews from people who actually stayed.',
    },
  ];
}
