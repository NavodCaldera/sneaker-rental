import "server-only";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import { db } from "../db";
import { flushEmails } from "../notify";
import { endRental } from "./lifecycle";
import { expireOffers } from "./reservations";

/**
 * The daily job (pricing-spec.md §6a). Ends every held pair whose term ended yesterday or
 * earlier: its last day is the term's last day, and a driver collects it (or hands it to the
 * next borrower), with the waiting days free. Cancels reservations whose higher price wasn't
 * accepted in time, and sends queued emails. Safe to run more than once a day.
 */
export async function runDailyRentals(now = new Date()) {
  const due = await db.rentalItem.findMany({
    where: {
      status: "ACTIVE",
      lastDay: null,
      termEndDay: { lt: dayToDate(colomboDay(now)) },
    },
    select: { id: true, rental: { select: { borrowerId: true } } },
  });
  let ended = 0;
  for (const item of due) {
    await endRental(item.rental.borrowerId, item.id, now, { termEnded: true });
    ended += 1;
  }
  const expired = await expireOffers(now);
  const emailed = await flushEmails(now);
  return { ended, expired, emailed };
}
