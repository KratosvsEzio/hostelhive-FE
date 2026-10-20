/** How one notification type looks wherever notifications are listed. */
export interface NotificationTypeStyle {
  icon: string;
  /**
   * Translation key of the type's name (`notifications.types.*`), or `null` for a type the app
   * doesn't know yet, which shows `fallbackLabel` instead.
   */
  labelKey: string | null;
  /** The type title-cased (`hostel_invite` → "Hostel Invite"); shown only without a `labelKey`. */
  fallbackLabel: string;
  /** Tint for the icon tile. */
  bg: string;
  /** Colour for the type label. */
  text: string;
}

type KnownTypeStyle = Omit<NotificationTypeStyle, 'fallbackLabel'>;

const NOTIFICATION_TYPES: Record<string, KnownTypeStyle> = {
  meal_confirmation: {
    icon: 'ti-tools-kitchen-2',
    labelKey: 'notifications.types.mealConfirmation',
    bg: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-600',
  },
  rent: {
    icon: 'ti-cash',
    labelKey: 'notifications.types.rent',
    bg: 'bg-amber-50 text-amber-600',
    text: 'text-amber-600',
  },
  receipt: {
    icon: 'ti-receipt',
    labelKey: 'notifications.types.receipt',
    bg: 'bg-blue-50 text-blue-600',
    text: 'text-blue-600',
  },
  card_declined: {
    icon: 'ti-credit-card',
    labelKey: 'notifications.types.cardDeclined',
    bg: 'bg-danger/10 text-danger',
    text: 'text-danger',
  },
  card_expiring: {
    icon: 'ti-credit-card',
    labelKey: 'notifications.types.cardExpiring',
    bg: 'bg-warn/10 text-warn',
    text: 'text-warn',
  },
  // The rest of the billing notices (Trello #219). Icons come from the subset font
  // (`npm run icons:check`), so only glyphs it already ships are used.
  payment_received: {
    icon: 'ti-circle-check',
    labelKey: 'notifications.types.paymentReceived',
    bg: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-600',
  },
  payment_rejected: {
    icon: 'ti-circle-x',
    labelKey: 'notifications.types.paymentRejected',
    bg: 'bg-danger/10 text-danger',
    text: 'text-danger',
  },
  renewal_invoice: {
    icon: 'ti-file-invoice',
    labelKey: 'notifications.types.renewalInvoice',
    bg: 'bg-blue-50 text-blue-600',
    text: 'text-blue-600',
  },
  renewal_reminder: {
    icon: 'ti-clock',
    labelKey: 'notifications.types.renewalReminder',
    bg: 'bg-amber-50 text-amber-600',
    text: 'text-amber-600',
  },
  subscription_past_due: {
    icon: 'ti-alert-triangle',
    labelKey: 'notifications.types.subscriptionPastDue',
    bg: 'bg-warn/10 text-warn',
    text: 'text-warn',
  },
  subscription_ended: {
    icon: 'ti-calendar-x',
    labelKey: 'notifications.types.subscriptionEnded',
    bg: 'bg-danger/10 text-danger',
    text: 'text-danger',
  },
};

/** Every notification type with a look and a translated name of its own. */
export const KNOWN_NOTIFICATION_TYPES: readonly string[] = Object.keys(NOTIFICATION_TYPES);

function titleCase(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The icon, label and colours for a notification type. A known type's label is a translation
 * key; an unknown type gets a bell and its name title-cased, since there is nothing to translate.
 */
export function notificationTypeStyle(type: string): NotificationTypeStyle {
  const fallbackLabel = titleCase(type);
  if (Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type)) {
    return { ...NOTIFICATION_TYPES[type], fallbackLabel };
  }
  return {
    icon: 'ti-bell',
    labelKey: null,
    fallbackLabel,
    bg: 'bg-ink-50 text-ink-600',
    text: 'text-ink-500',
  };
}
