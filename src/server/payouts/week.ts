/** ISO week in Asia/Colombo, e.g. "2026-W41". One payout per merchant per week. */
export function isoWeek(date: Date): string {
  const colombo = new Date(date.getTime() + 5.5 * 3_600_000);
  const d = new Date(
    Date.UTC(colombo.getUTCFullYear(), colombo.getUTCMonth(), colombo.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
