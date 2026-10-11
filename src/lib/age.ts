/** Dates here are calendar dates, YYYY-MM-DD. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Colombo, YYYY-MM-DD. */
export function colomboToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(now);
}

/** A real calendar date (rejects 2026-02-30 and anything not YYYY-MM-DD). */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whole years from a date of birth to `today` (the age on that day). */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** The oldest age we accept, to catch a mistyped year. */
export const MAX_AGE = 120;
