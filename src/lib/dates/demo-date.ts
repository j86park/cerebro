import { env } from "@/lib/config";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Returns the vault/demo clock as a Date (never wall clock).
 */
export function demoNow(): Date {
  return new Date(env.DEMO_DATE);
}

/**
 * Adds (or subtracts) whole days relative to `env.DEMO_DATE`.
 */
export function addDemoDays(days: number, from: Date = demoNow()): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Whole calendar days from `from` to `to` (ceil of ms delta / day).
 * Positive when `to` is after `from`.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Days until `expiryDate` relative to DEMO_DATE.
 * Negative when already past DEMO_DATE.
 */
export function daysUntilExpiry(expiryDate: Date, asOf: Date = demoNow()): number {
  return daysBetween(asOf, expiryDate);
}

/**
 * REGULATORY: document is expired when expiryDate is on or before DEMO_DATE.
 */
export function isExpired(expiryDate: Date | null | undefined, asOf: Date = demoNow()): boolean {
  if (!expiryDate) return false;
  return expiryDate.getTime() <= asOf.getTime();
}

/**
 * REGULATORY: whether `asOf` is within `years` of `anchor` (inclusive of boundary day).
 * Used for recency rules (e.g. proof of address dated within 12 months).
 */
export function isWithinRecencyYears(
  anchor: Date,
  years: number,
  asOf: Date = demoNow(),
): boolean {
  const cutoff = new Date(asOf);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return anchor.getTime() >= cutoff.getTime();
}

/**
 * Years between two dates using UTC year/month/day (fractional via day remainder).
 */
export function yearsBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / (MS_PER_DAY * 365.25);
}
