import { StatusTone } from '@hostelhive/ui';
import { BookingStage, GuestBooking, STAGE_ORDER, isOffTrack } from './my-bookings-api';

export type TrackStep = (typeof STAGE_ORDER)[number];

/** How each stage reads on its pill. The list and the detail page must agree. */
export const STAGE_STATUS: Record<BookingStage, { key: string; tone: StatusTone }> = {
  requested: { key: 'userBookings.awaitingHostel', tone: 'warn' },
  confirmed: { key: 'userBookings.confirmed', tone: 'ok' },
  'checked-in': { key: 'userBookings.stageCheckedIn', tone: 'ok' },
  'checked-out': { key: 'userBookings.completed', tone: 'neutral' },
  cancelled: { key: 'userBookings.cancelled', tone: 'danger' },
  'no-show': { key: 'userBookings.noShow', tone: 'danger' },
};

export const STEP_LABEL: Record<TrackStep, string> = {
  requested: 'userBookings.stageRequested',
  confirmed: 'userBookings.stageConfirmed',
  'checked-in': 'userBookings.stageCheckedIn',
  'checked-out': 'userBookings.stageCheckedOut',
};

export function statusOf(b: GuestBooking): { key: string; tone: StatusTone } | null {
  return b.stage ? STAGE_STATUS[b.stage] : null;
}

/** How far along the track a booking is: the index of its stage, or -1 off the track. */
export function stageIndex(b: GuestBooking): number {
  return b.stage && !isOffTrack(b.stage) ? STAGE_ORDER.indexOf(b.stage) : -1;
}

/** A wall date as local midnight, so `DatePipe` prints the day it names and no other. */
export function asDay(date: string): string {
  return date ? `${date}T00:00:00` : '';
}
