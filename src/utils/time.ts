import { fromZonedTime, toZonedTime } from 'date-fns-tz';

// ============================================================================
// Basic interval math (existing)
// ============================================================================

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function subMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() - minutes * 60_000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function isSameOrAfter(a: Date, b: Date): boolean {
  return a.getTime() >= b.getTime();
}

export function isSameOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

// ============================================================================
// Venue-timezone helpers (Phase 7)
// ============================================================================

/**
 * Venue timezone, e.g. 'Africa/Lagos'. Set via VENUE_TZ env var.
 * Defaults to UTC to preserve behavior for anyone who hasn't configured it.
 */
export function venueTimezone(): string {
  return process.env.VENUE_TZ ?? 'UTC';
}

/**
 * Combine a calendar date ('YYYY-MM-DD') with a wall-clock time ('HH:MM' or
 * 'HH:MM:SS') in the venue's timezone, and return the corresponding absolute
 * instant (a Date in UTC under the hood).
 *
 * Example (VENUE_TZ='Africa/Lagos'):
 *   combineVenueDateAndTime('2026-10-23', '20:00') → Date for 19:00 UTC
 */
export function combineVenueDateAndTime(
  date: string,
  time: string,
  tz: string = venueTimezone(),
): Date {
  const normalized = time.length === 5 ? `${time}:00` : time;
  const naive = `${date}T${normalized}`;
  return fromZonedTime(naive, tz);
}

/**
 * Compute the venue-local day of week (0=Sunday .. 6=Saturday) for a given
 * calendar date string. Independent of the server's timezone.
 */
export function venueDayOfWeek(
  date: string,
  tz: string = venueTimezone(),
): number {
  // Parse as noon in venue-local time to avoid midnight/DST edge cases.
  const noonLocal = combineVenueDateAndTime(date, '12:00', tz);
  const zoned = toZonedTime(noonLocal, tz);
  return zoned.getDay();
}

/**
 * Format an absolute instant as a wall-clock 'HH:MM' in the venue timezone.
 */
export function formatVenueTime(
  d: Date,
  tz: string = venueTimezone(),
): string {
  const zoned = toZonedTime(d, tz);
  const h = String(zoned.getHours()).padStart(2, '0');
  const m = String(zoned.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Start-of-day in venue timezone, returned as an absolute instant.
 */
export function venueStartOfDay(
  date: string,
  tz: string = venueTimezone(),
): Date {
  return combineVenueDateAndTime(date, '00:00', tz);
}
