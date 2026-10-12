"use client";

import { useActionState, useMemo, useState } from "react";
import { type PackActionState, savePackAction } from "@/app/packs/actions";
import { Alert, Button, Card, Field, Input, Select, cx } from "@/components/ui";
import { ALL_EXPERIENCES } from "@/lib/shoe-style";
import type { PackInput, PickablePair } from "@/server/packs";

const MAX_ROLES = 8;
const MAX_PAIRS = 4;

type RoleDraft = PackInput["roles"][number] & { key: number };

let nextKey = 1;
const blankRole = (): RoleDraft => ({
  key: nextKey++,
  name: "",
  description: "",
  experience: "",
  shoeIds: [],
});

/**
 * Make or edit a style pack: title, subtitle, "Rotation Advantage" line and up to 8 roles,
 * each filled by 1–4 listed pairs from any merchant (picked by searching the catalogue).
 * Roles are posted as JSON. An admin making a new pack can save and publish at once.
 */
export function StylePackEditor({
  packId,
  pairs,
  initial,
  canPublishNow = false,
}: {
  packId: string | null;
  pairs: PickablePair[];
  initial?: PackInput;
  /** An admin making a new pack: show "Save and publish" */
  canPublishNow?: boolean;
}) {
  const [state, action, pending] = useActionState<PackActionState, FormData>(
    savePackAction.bind(null, packId),
    {},
  );
  const [roles, setRoles] = useState<RoleDraft[]>(() =>
    initial?.roles.length
      ? initial.roles.map((r) => ({ ...r, key: nextKey++ }))
      : [blankRole(), blankRole()],
  );
  const issues = state.issues ?? {};
  const byId = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);
  const payload = JSON.stringify(roles.map(({ key: _key, ...r }) => r));

  const update = (key: number, patch: Partial<RoleDraft>) =>
    setRoles((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) =>
    setRoles((rs) => {
      const next = [...rs];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="roles" value={payload} />
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}

      <Card className="grid gap-4">
        <Field label="Title" name="title" error={issues.title}>
          <Input
            id="title"
            name="title"
            defaultValue={initial?.title}
            maxLength={80}
            placeholder="The Marathon & Active Recovery"
            required
          />
        </Field>
        <Field label="Subtitle (optional)" name="subtitle" error={issues.subtitle}>
          <Input
            id="subtitle"
            name="subtitle"
            defaultValue={initial?.subtitle}
            maxLength={160}
            placeholder="Peak performance on tempo runs, cushioned support on recovery days."
          />
        </Field>
        <Field
          label="Rotation advantage (optional)"
          name="highlight"
          error={issues.highlight}
          hint="One line on why these pairs work together."
        >
          <Input
            id="highlight"
            name="highlight"
            defaultValue={initial?.highlight}
            maxLength={120}
            placeholder="Hold 3 pairs · wear splits 3 ways"
          />
        </Field>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-medium">Roles</h2>
            <p className="text-sm text-subtle">
              Each role is one pair in the rotation. Pick 1–{MAX_PAIRS} listed pairs to fill it,
              from any merchant.
            </p>
          </div>
          {issues.roles && (
            <p className="text-xs font-medium text-ink" role="alert">
              {issues.roles}
            </p>
          )}
        </div>
        {roles.map((role, i) => (
          <RoleCard
            key={role.key}
            index={i}
            role={role}
            count={roles.length}
            pairs={pairs}
            byId={byId}
            issues={issues}
            onChange={(patch) => update(role.key, patch)}
            onMove={(by) => move(i, by)}
            onRemove={() => setRoles((rs) => rs.filter((r) => r.key !== role.key))}
          />
        ))}
        {roles.length < MAX_ROLES && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setRoles((rs) => [...rs, blankRole()])}
          >
            Add a role
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" disabled={pending}>
          {pending ? "Saving…" : packId ? "Save changes" : "Save draft"}
        </Button>
        {canPublishNow && (
          <Button
            type="submit"
            name="intent"
            value="publish"
            variant="secondary"
            disabled={pending}
          >
            Save and publish
          </Button>
        )}
      </div>
    </form>
  );
}

function RoleCard({
  index,
  role,
  count,
  pairs,
  byId,
  issues,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  role: RoleDraft;
  count: number;
  pairs: PickablePair[];
  byId: Map<string, PickablePair>;
  issues: Record<string, string>;
  onChange: (patch: Partial<RoleDraft>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const n = index + 1;
  const err = (field: string) => issues[`roles.${index}.${field}`];
  const matches = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return [];
    return pairs
      .filter((p) => !role.shoeIds.includes(p.id))
      .filter((p) => `${p.name} ${p.size} ${p.merchant}`.toLowerCase().includes(t))
      .slice(0, 8);
  }, [search, pairs, role.shoeIds]);
  const full = role.shoeIds.length >= MAX_PAIRS;

  return (
    <Card className="flex flex-col gap-4" aria-label={`Role ${n}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
            {n}
          </span>
          Role {n}
        </span>
        <span className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move role ${n} up`}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move role ${n} down`}
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={count === 1}
            onClick={onRemove}
            aria-label={`Remove role ${n}`}
          >
            Remove
          </Button>
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Role ${n} name`} name={`role-${role.key}-name`} error={err("name")}>
          <Input
            id={`role-${role.key}-name`}
            value={role.name}
            maxLength={60}
            placeholder="Speed & Tempo Day"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
        <Field
          label={`Role ${n} experience (optional)`}
          name={`role-${role.key}-experience`}
          error={err("experience")}
        >
          <Select
            id={`role-${role.key}-experience`}
            value={role.experience}
            onChange={(e) => onChange({ experience: e.target.value })}
          >
            <option value="">None</option>
            {ALL_EXPERIENCES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={`Role ${n} description (optional)`}
            name={`role-${role.key}-description`}
            error={err("description")}
          >
            <Input
              id={`role-${role.key}-description`}
              value={role.description}
              maxLength={160}
              placeholder="Lightweight, propulsive ride for fast workouts"
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Pairs</span>
        {role.shoeIds.length === 0 ? (
          <p className="text-sm text-subtle">No pairs yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {role.shoeIds.map((id) => {
              const p = byId.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-full border border-line py-1 pl-3 pr-1 text-sm"
                >
                  <span>{p ? `${p.name} · ${p.size}` : "A pair that's no longer listed"}</span>
                  <button
                    type="button"
                    className="rounded-full px-2 text-subtle hover:bg-muted hover:text-ink"
                    aria-label={`Remove ${p?.name ?? "pair"} from role ${n}`}
                    onClick={() => onChange({ shoeIds: role.shoeIds.filter((x) => x !== id) })}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {err("shoeIds") && (
          <p className="text-xs font-medium text-ink" role="alert">
            {err("shoeIds")}
          </p>
        )}
        <Input
          aria-label={`Find a pair for role ${n}`}
          value={search}
          disabled={full}
          placeholder={
            full ? `Up to ${MAX_PAIRS} pairs per role` : "Search pairs by name, size or shop"
          }
          onChange={(e) => setSearch(e.target.value)}
        />
        {matches.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {matches.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-subtle">
                    {p.size} · {p.lifespanDays}-day life · {p.merchant}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className={cx("shrink-0")}
                  aria-label={`Add ${p.name} (${p.size}) to role ${n}`}
                  onClick={() => {
                    onChange({ shoeIds: [...role.shoeIds, p.id] });
                    setSearch("");
                  }}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        {search.trim() && matches.length === 0 && !full && (
          <p className="text-sm text-subtle">No listed pair matches “{search.trim()}”.</p>
        )}
      </div>
    </Card>
  );
}
