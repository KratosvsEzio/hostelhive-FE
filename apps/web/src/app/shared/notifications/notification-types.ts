/** How one notification type looks wherever notifications are listed. */
export interface NotificationTypeStyle {
  icon: string;
  label: string;
  /** Tint for the icon tile. */
  bg: string;
  /** Colour for the type label. */
  text: string;
}

const NOTIFICATION_TYPES: Record<string, NotificationTypeStyle> = {
  meal_confirmation: {
    icon: 'ti-tools-kitchen-2',
    label: 'Meal Confirmation',
    bg: 'bg-emerald-50 text-emerald-600',
    text: 'text-emerald-600',
  },
  rent: {
    icon: 'ti-cash',
    label: 'Rent',
    bg: 'bg-amber-50 text-amber-600',
    text: 'text-amber-600',
  },
  receipt: {
    icon: 'ti-receipt',
    label: 'Receipt',
    bg: 'bg-blue-50 text-blue-600',
    text: 'text-blue-600',
  },
  card_declined: {
    icon: 'ti-credit-card',
    label: 'Card declined',
    bg: 'bg-danger/10 text-danger',
    text: 'text-danger',
  },
  card_expiring: {
    icon: 'ti-credit-card',
    label: 'Card expiring',
    bg: 'bg-warn/10 text-warn',
    text: 'text-warn',
  },
};

function titleCase(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The icon, label and colours for a notification type; unknown types get a bell and a title-cased label. */
export function notificationTypeStyle(type: string): NotificationTypeStyle {
  if (Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, type)) {
    return NOTIFICATION_TYPES[type];
  }
  return {
    icon: 'ti-bell',
    label: titleCase(type),
    bg: 'bg-ink-50 text-ink-600',
    text: 'text-ink-500',
  };
}
