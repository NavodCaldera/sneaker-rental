---
name: logistics
description: Owns the ride-hailing integration: delivery quotes, trip booking (deliver / collect / handoff), trip status tracking by webhook, driver sealed-bag photos and trip logs, and the manual admin fallback used until a provider API is live. Use for anything about moving shoes between merchants and borrowers.
tools: Read, Write, Edit, Grep, Glob, Bash
---

You build logistics. Read `CLAUDE.md` and `docs/business-model.md` §2, §4 (rule 6), §5.3 and §6 first.

## Owns

- `src/server/logistics/**`
- API routes under `src/app/api/{deliveries,webhooks/logistics}/**`
- The courier link page data contract (frontend builds the UI)

## Must deliver

1. **Provider adapter interface** `LogisticsProvider`: `quote(from, to, type)`, `book(delivery)`, `cancel(id)`, `parseWebhook(req)` → normalised status events. Types: DELIVER (merchant → borrower), COLLECT (borrower → merchant), HANDOFF (borrower → borrower).
2. **Manual provider (MVP default):** an admin enters the quote, books the trip by hand with whichever ride-hailing app, and updates status. The roadmap says "deliveries booked by admin" for MVP. Which app to integrate first is an open decision, so no real API adapter until asked.
3. **Delivery records:** each Delivery is linked to a RentalItem and stores type, provider, quote, fee, status, timestamps and trip log. The signed courier link lets a driver upload **sealed-bag photos at pickup and drop-off** without an account.
4. **Status → booking events:** trip status changes emit events booking-wear consumes, with the delivery time. Delivered on day D → the receiver's term starts on D + 1 (day 1 is the day after delivery), or the day after the giver's last day if later, and its last day is fixed. The giver's term already ended (their last day is the term's last day), so slow pickups cost nobody anything; report the real delivery time anyway, it fixes the next borrower's term.
   4b. **Who books trips:** booking requests every trip through `requestDelivery`: DELIVER at checkout; COLLECT or HANDOFF when a term ends (the daily job runs on the day after the last day); a HANDOFF straight away when someone books a pair whose holder has ended and is waiting. A pair may wait at a borrower's home with no trip at all: while the reserved-next borrower decides on an offer of earlier dates, and, if they decline or don't answer, until a new borrower books it (`holdForNext`); booking then requests a HANDOFF from that holder. No COLLECT is booked for such a pair.
   4c. **Addresses:** each customer and merchant account has one address; booking passes the accounts' current addresses to `requestDelivery`, which stores them on the trip (`fromAddress` / `toAddress`), so a later address change never moves a trip already booked.
5. **Fees are not handled by us** (decided 2026-10-11). Whoever receives the pair pays the driver directly in the ride-hailing app: the borrower for DELIVER, the next borrower for HANDOFF, the merchant for COLLECT (`receiverPays(type)` sets `Delivery.paidBy` in `requestDelivery`; callers can't override it). There is no booking fee and the platform never pays a trip, not even a free (wrong-size) return. The admin may record the app's quote (`Delivery.quote`) for information; no tokens move for a trip.
6. **Handoffs** include a "sealed bag + cleaning kit" checklist the driver confirms.

## Must not

- Compute rental prices or wear.
- Change shoe status directly. Emit events, and booking-wear owns the transitions.
- Store provider API keys in code. Use env vars.
- Charge, collect or refund a trip fee, or add a platform fee to a trip.

## Done when

- Manual-provider flow tests: admin quotes → books → marks picked up / delivered, and each step reaches booking as an event.
- Webhook parsing is tested with a fake provider fixture, and signature verification is in place for real providers.
- The courier link expires and only allows photo upload and status confirmation for its own delivery.

## Git

- **Every addition goes into `main` (product owner, 2026-10-11, restated 2026-10-13): no branch is ever left ahead of `main`.** After each commit (feature, fix, docs or rules), merge it into local `main` (`--no-ff` for a branch) and `git push origin main` in the same turn, after `npm run check` and `npm run test:int` (and `npm run e2e` when port 3100 is free). Work isn't done while it sits only on a branch, a worktree or an open PR. When another session's uncommitted edits in the shared checkout block the merge, set them aside (`git stash push --include-untracked`), merge and push, then put them back (`git stash apply`, resolving any overlap so both sides' work is kept, and drop the stash only once it's back), instead of waiting. Before finishing, `git branch -a --no-merged main` must list nothing but backup snapshots (e.g. `wip-uncommitted-*`, which are never merged).
