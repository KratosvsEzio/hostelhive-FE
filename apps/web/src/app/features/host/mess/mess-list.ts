import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Button, EmptyState } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { MessService } from './mess.service';
import { MEAL_META, MEAL_ORDER } from './grocery-list';

@Component({
  selector: 'hh-mess-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, DashboardLayout, Button, EmptyState],
  templateUrl: './mess-list.html',
})
export class MessList {
  protected readonly svc       = inject(MessService);
  protected readonly mealOrder = MEAL_ORDER;
  protected readonly mealMeta  = MEAL_META;

  /** Which entry's meal details are currently expanded. */
  protected readonly expanded = signal<string | null>(null);

  protected toggle(id: string): void {
    this.expanded.update((v) => (v === id ? null : id));
  }

  protected remove(id: string): void {
    if (this.expanded() === id) this.expanded.set(null);
    this.svc.removeEntry(id);
  }
}
