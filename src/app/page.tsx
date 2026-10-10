import { redirect } from "next/navigation";
import { LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/server/auth/service";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main className="flex max-w-2xl flex-1 flex-col justify-center gap-6 py-10">
      <h1 className="text-4xl font-semibold tracking-tight">Sneaker Rental Marketplace</h1>
      <p className="text-lg text-subtle">
        Wear more sneakers than you own, and pay only for the wear you put on them.
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <strong>Fair prices that fall with age.</strong> New pairs cost more per day; worn pairs
          cost less.
        </li>
        <li>
          <strong>Up to four pairs for the price of one.</strong> Wear is split across the pairs you
          hold.
        </li>
        <li>
          <strong>Delivered to your door</strong> and passed on to the next borrower when
          you&apos;re done.
        </li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/browse">Browse sneakers</LinkButton>
        <LinkButton href="/sign-up?role=MERCHANT" variant="secondary">
          List your shoes
        </LinkButton>
      </div>
    </main>
  );
}
