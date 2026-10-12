import Link from "next/link";
import { Badge, EmptyState } from "@/components/ui";
import type { StylePackStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import { PACK_STATUS, rotationBadge } from "@/lib/style-pack";

type Row = {
  id: string;
  title: string;
  status: StylePackStatus;
  updatedAt: Date;
  _count: { roles: number };
  createdBy: { name: string; role: string; merchant: { businessName: string } | null };
};

/** Packs to manage, with status; admins also see who made each one. */
export function StylePackList({
  packs,
  base,
  showMaker = false,
}: {
  packs: Row[];
  base: string;
  showMaker?: boolean;
}) {
  if (packs.length === 0) {
    return (
      <EmptyState title="No style packs yet">
        Put together a rotation of pairs that work well together, like a running pack or a work week
        wardrobe.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {packs.map((p) => {
        const s = PACK_STATUS[p.status];
        return (
          <li key={p.id}>
            <Link
              href={`${base}/${p.id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-4 text-sm hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.title}</span>
                <span className="block text-xs text-subtle">
                  {rotationBadge(p._count.roles)}
                  {showMaker &&
                    ` · by ${p.createdBy.role === "ADMIN" ? "admin" : (p.createdBy.merchant?.businessName ?? p.createdBy.name)}`}
                  {` · updated ${formatDate(p.updatedAt)}`}
                </span>
              </span>
              <Badge tone={s.tone}>{s.label}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
