import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime, formatTokens } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { gateway } from "@/server/payments/gateway";
import { walletBalance, walletHistory } from "@/server/wallet";
import { TopUpForm, WithdrawForm } from "./wallet-forms";
import { shoeName } from "@/lib/shoe-name";

export const metadata: Metadata = { title: "Wallet" };

const KIND_LABEL = {
  TOP_UP: "Top-up",
  WITHDRAWAL: "Withdrawal",
  LOCK: "Locked",
  UNLOCK: "Unlocked",
  CHARGE: "Charged",
  CREDIT: "Credited",
} as const;

/** Entries that change the balance get a sign; locks only move tokens between columns. */
const SIGN = { TOP_UP: "+", CREDIT: "+", CHARGE: "−", WITHDRAWAL: "−", LOCK: "", UNLOCK: "" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function WalletPage({ searchParams }: PageProps<"/wallet">) {
  const user = await requireUser("BORROWER");
  const sp = await searchParams;
  const [balance, history] = await Promise.all([walletBalance(user.id), walletHistory(user.id)]);
  const amount = one(sp.amount);
  const next = one(sp.next);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Wallet"
        description="Tokens pay for your rentals (1 token = LKR 1). Booking locks the pairs' value plus the rent estimate; you pay only for the wear you add, and the rest is unlocked when the pairs come back."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-subtle">Available</div>
          <div className="text-2xl font-semibold">{formatTokens(balance.available)}</div>
        </Card>
        <Card>
          <div className="text-sm text-subtle">Locked for rentals</div>
          <div className="text-2xl font-semibold">{formatTokens(balance.locked)}</div>
        </Card>
        <Card>
          <div className="text-sm text-subtle">Total balance</div>
          <div className="text-2xl font-semibold">{formatTokens(balance.balance)}</div>
        </Card>
      </div>
      {balance.balance.lt(0) && (
        <p className="text-sm text-danger">
          Your balance is below zero. Top up to clear it before booking again.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">Top up</h2>
          <TopUpForm
            amount={amount}
            next={next}
            formKey={randomUUID()}
            testMode={gateway().name === "mock"}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Withdraw</h2>
          <p className="mb-3 text-sm text-subtle">
            Unlocked tokens go back to the card you paid with.
          </p>
          <WithdrawForm available={formatTokens(balance.available.gt(0) ? balance.available : 0)} />
        </Card>
      </div>
      <section aria-label="History">
        <h2 className="mb-2 font-medium">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-subtle">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {history.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span>
                  <span className="font-medium">{KIND_LABEL[e.kind]}</span>
                  {e.note && <span className="text-subtle"> · {e.note}</span>}
                  {e.rentalItem && (
                    <span className="text-subtle">
                      {" "}
                      ·{" "}
                      <Link href="/rentals" className="underline">
                        {shoeName(e.rentalItem.shoe)}
                      </Link>
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-subtle">{formatDateTime(e.createdAt)}</span>
                  <span className="font-medium tabular-nums">
                    {SIGN[e.kind]}
                    {formatTokens(e.amount.toString())}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
