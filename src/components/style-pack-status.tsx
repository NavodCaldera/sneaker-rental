"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  type PackActionState,
  deletePackAction,
  publishPackAction,
  rejectPackAction,
  submitPackAction,
  unpublishPackAction,
  withdrawPackAction,
} from "@/app/packs/actions";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import type { StylePackStatus } from "@/generated/prisma/enums";
import { PACK_STATUS } from "@/lib/style-pack";

/**
 * A pack's status and what can be done with it. Merchants send packs for review and can
 * withdraw them; admins publish (a merchant's pack once sent, their own at any time), reject
 * with a reason, or take a pack off the site. Either can delete.
 */
export function StylePackStatusPanel({
  packId,
  status,
  reviewNote,
  viewer,
  madeByMerchant,
}: {
  packId: string;
  status: StylePackStatus;
  reviewNote: string | null;
  viewer: "MERCHANT" | "ADMIN";
  madeByMerchant: boolean;
}) {
  const one = (fn: (id: string) => Promise<PackActionState>) => async () => fn(packId);
  const [submitState, submit, submitting] = useActionState(one(submitPackAction), {});
  const [withdrawState, withdraw, withdrawing] = useActionState(one(withdrawPackAction), {});
  const [publishState, publish, publishing] = useActionState(one(publishPackAction), {});
  const [deleteState, remove, deleting] = useActionState(one(deletePackAction), {});
  const [rejectState, reject, rejecting] = useActionState<PackActionState, FormData>(
    rejectPackAction.bind(null, packId),
    {},
  );
  const [unpublishState, unpublish, unpublishing] = useActionState<PackActionState, FormData>(
    unpublishPackAction.bind(null, packId),
    {},
  );
  const results = [
    submitState,
    withdrawState,
    publishState,
    deleteState,
    rejectState,
    unpublishState,
  ];
  const error = results.find((r) => r.error)?.error;
  const ok = results.find((r) => r.ok)?.ok;
  const s = PACK_STATUS[status];
  const admin = viewer === "ADMIN";
  const canPublish = admin && status !== "PUBLISHED" && (!madeByMerchant || status === "SUBMITTED");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Status</span>
        <Badge tone={s.tone}>{s.label}</Badge>
        <Link href={`/packs/${packId}`} className="ml-auto text-sm underline">
          {status === "PUBLISHED" ? "View on the site" : "Preview"}
        </Link>
      </div>
      {reviewNote && (status === "REJECTED" || status === "DRAFT") && (
        <Alert tone="info">Admin note: {reviewNote}</Alert>
      )}
      {!admin && status === "SUBMITTED" && (
        <p className="text-sm text-subtle">
          An admin will review it. Borrowers see it once it&apos;s approved.
        </p>
      )}
      {!admin && status === "PUBLISHED" && (
        <p className="text-sm text-subtle">
          Saving changes sends it back for review; it stays hidden until approved again.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {ok && <Alert tone="good">{ok}</Alert>}

      <div className="flex flex-wrap gap-2">
        {!admin && (status === "DRAFT" || status === "REJECTED") && (
          <form action={submit}>
            <Button disabled={submitting}>Send for review</Button>
          </form>
        )}
        {!admin && (status === "SUBMITTED" || status === "PUBLISHED") && (
          <form action={withdraw}>
            <Button variant="secondary" disabled={withdrawing}>
              {status === "PUBLISHED" ? "Take off the site" : "Withdraw from review"}
            </Button>
          </form>
        )}
        {canPublish && (
          <form action={publish}>
            <Button disabled={publishing}>
              {madeByMerchant ? "Approve and publish" : "Publish"}
            </Button>
          </form>
        )}
        <form
          action={remove}
          onSubmit={(e) => {
            if (!confirm("Delete this pack? This can't be undone.")) e.preventDefault();
          }}
        >
          <Button variant="ghost" disabled={deleting}>
            Delete
          </Button>
        </form>
      </div>

      {admin && madeByMerchant && status === "SUBMITTED" && (
        <form action={reject} className="flex flex-col gap-2">
          <label htmlFor={`reject-${packId}`} className="text-sm font-medium">
            Ask for changes
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`reject-${packId}`}
              name="note"
              maxLength={300}
              placeholder="What should the merchant change?"
              className="min-w-0 flex-1"
            />
            <Button variant="danger" disabled={rejecting}>
              Reject
            </Button>
          </div>
          {rejectState.issues?.note && (
            <p className="text-xs font-medium text-ink" role="alert">
              {rejectState.issues.note}
            </p>
          )}
        </form>
      )}
      {admin && status === "PUBLISHED" && (
        <form action={unpublish} className="flex flex-col gap-2">
          <label htmlFor={`unpublish-${packId}`} className="text-sm font-medium">
            Take it off the site
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`unpublish-${packId}`}
              name="note"
              maxLength={300}
              placeholder="Reason for the merchant (optional)"
              className="min-w-0 flex-1"
            />
            <Button variant="secondary" disabled={unpublishing}>
              Unpublish
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
