import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Card, StatusPill, Toggle } from '@hostelhive/ui';
import type { SavedCard as SavedCardModel } from '@hostelhive/data-access';
import { ApiDate, localDay } from '@util/api-date';

/** A card action the block offers; the page runs it and reports which one is in flight. */
export type SavedCardAction = 'save' | 'remove' | 'autoRenew';

/** How close the card is to its expiry: past it, within the warning window, or neither. */
export type CardExpiry = 'expired' | 'expiring' | null;

/** Days before its expiry date that a card starts to warn. */
const EXPIRY_WARNING_DAYS = 30;

const HINT_ID = 'saved-card-auto-renew-hint';

/**
 * Where a card stands against its expiry date on `today`. Compared as `YYYY-MM-DD` strings, so a
 * card expiring today is not yet expired and the viewer's clock time never matters.
 */
export function cardExpiry(
  expiresOn: string | null,
  today: Date = new Date(),
): CardExpiry {
  if (!expiresOn) return null;
  const expires = expiresOn.slice(0, 10);
  if (expires < localDay(today)) return 'expired';
  const limit = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + EXPIRY_WARNING_DAYS,
  );
  return expires <= localDay(limit) ? 'expiring' : null;
}

/**
 * The card kept at Safepay for automatic renewal: its label and expiry as returned, Save /
 * Replace / Remove, and the auto-renew switch.
 *
 * The page owns every write. `autoRenew` is the value the switch shows; `hh-toggle` flips itself
 * on click, so the page mirrors each `autoRenewChange` and writes the server's value back when
 * the change fails. `showAutoRenew` is for live plans only, and `autoRenewBlocked` (a plan that
 * ends at period end) keeps the switch off with a hint to resume. Without `canManage` the block
 * is read-only. A block-level error is projected into the bottom of the card.
 *
 * `<hh-saved-card [card]="billing.saved_card" [autoRenew]="autoRenew()" (saveCard)="save()" />`
 */
@Component({
  selector: 'hh-saved-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Card, StatusPill, Toggle, TranslocoPipe, ApiDate],
  host: { class: 'block' },
  template: `
    <hh-card variant="bordered">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="font-display text-lg font-bold text-ink-900">
            {{ 'hostBilling.savedCardTitle' | transloco }}
          </h2>
          @if (card(); as c) {
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <i
                class="ti ti-credit-card text-lg text-ink-400"
                aria-hidden="true"
              ></i>
              <p class="text-sm font-medium text-ink-900" data-field="label">
                <bdi>{{ c.label }}</bdi>
              </p>
              @switch (expiry()) {
                @case ('expired') {
                  <hh-status-pill tone="danger" data-field="expiry-warning">{{
                    'hostBilling.cardExpired' | transloco
                  }}</hh-status-pill>
                }
                @case ('expiring') {
                  <hh-status-pill tone="warn" data-field="expiry-warning">{{
                    'hostBilling.cardExpiringSoon' | transloco
                  }}</hh-status-pill>
                }
              }
            </div>
            @if (c.expires_on) {
              <p class="mt-1 text-sm text-ink-600" data-field="expiry">
                {{
                  'hostBilling.cardExpires'
                    | transloco: { date: (c.expires_on | apiDate: 'MM/yy') }
                }}
              </p>
            }
          } @else {
            <p
              class="mt-2 text-sm font-medium text-ink-900"
              data-field="no-card"
            >
              {{ 'hostBilling.noCardSaved' | transloco }}
            </p>
            <p class="mt-1 text-sm text-ink-600">
              {{ 'hostBilling.noCardHint' | transloco }}
            </p>
          }
        </div>
        @if (canManage()) {
          <div class="flex flex-wrap items-center gap-2">
            @if (card()) {
              <button
                hh-button
                type="button"
                variant="text"
                color="danger"
                size="sm"
                data-testid="card-remove"
                [disabled]="locked()"
                [loading]="busy() === 'remove'"
                (click)="removeCard.emit()"
              >
                {{ 'hostBilling.removeCard' | transloco }}
              </button>
              <button
                hh-button
                type="button"
                variant="outlined"
                size="md"
                data-testid="card-save"
                [disabled]="locked()"
                [loading]="busy() === 'save'"
                (click)="saveCard.emit()"
              >
                {{ 'hostBilling.replaceCard' | transloco }}
              </button>
            } @else {
              <button
                hh-button
                type="button"
                color="primary"
                size="md"
                data-testid="card-save"
                [disabled]="locked()"
                [loading]="busy() === 'save'"
                (click)="saveCard.emit()"
              >
                {{ 'hostBilling.saveCard' | transloco }}
              </button>
            }
          </div>
        }
      </div>
      @if (switchShown()) {
        <div
          class="mt-4 border-t border-ink-100 pt-4"
          data-testid="auto-renew"
          [attr.aria-busy]="busy() === 'autoRenew' || null"
        >
          <label
            class="flex items-center justify-between gap-4 text-sm font-semibold text-ink-800"
          >
            {{ 'hostBilling.autoRenew' | transloco }}
            <hh-toggle
              [checked]="autoRenewShown()"
              [disabled]="switchDisabled()"
              (checkedChange)="autoRenewChange.emit($event)"
            />
          </label>
          <p
            class="mt-1 text-sm text-ink-600"
            data-field="auto-renew-hint"
            [id]="hintId"
          >
            {{ hintKey() | transloco }}
          </p>
        </div>
      }
      @if (!canManage()) {
        <p
          class="mt-4 flex items-center gap-2 text-sm text-ink-600"
          data-testid="card-owner-only"
        >
          <i class="ti ti-lock text-base text-ink-400" aria-hidden="true"></i>
          {{ 'hostBilling.ownerOnly' | transloco }}
        </p>
      }
      <ng-content />
    </hh-card>
  `,
})
export class SavedCard {
  readonly card = input.required<SavedCardModel | null>();
  readonly autoRenew = input(false);
  readonly showAutoRenew = input(false);
  readonly autoRenewBlocked = input(false);
  readonly canManage = input(false);
  readonly busy = input<SavedCardAction | null>(null);
  readonly locked = input(false);
  readonly saveCard = output<void>();
  readonly removeCard = output<void>();
  readonly autoRenewChange = output<boolean>();

  protected readonly hintId = HINT_ID;

  private readonly switchHost = viewChild(Toggle, { read: ElementRef });

  protected readonly expiry = computed(() =>
    cardExpiry(this.card()?.expires_on ?? null),
  );

  // Renewal charges the saved card, so with no card there is nothing to switch on.
  protected readonly switchShown = computed(
    () => this.showAutoRenew() && !!this.card(),
  );

  protected readonly autoRenewShown = computed(
    () => this.autoRenew() && !this.autoRenewBlocked(),
  );

  protected readonly switchDisabled = computed(
    () => this.locked() || !this.canManage() || this.autoRenewBlocked(),
  );

  protected readonly hintKey = computed(() =>
    this.autoRenewBlocked()
      ? 'hostBilling.autoRenewResumeHint'
      : 'hostBilling.autoRenewHint',
  );

  constructor() {
    // hh-toggle renders its own switch button, so the hint is tied to that button directly.
    effect(() => {
      const host = this.switchHost()?.nativeElement as HTMLElement | undefined;
      host
        ?.querySelector('[role="switch"]')
        ?.setAttribute('aria-describedby', HINT_ID);
    });
  }
}
