import Link from "next/link";
import {
  BECOMING_QUESTION,
  GENDERS,
  PERSONAS,
  isoDate,
  splitShoeSize,
  type ProfileUser,
} from "@/lib/borrower-profile";
import { LISTING_SIZE_SYSTEMS } from "@/lib/shoe-size";
import { Field, Input, Select, cx } from "./ui";

const pill =
  "cursor-pointer rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-ink has-[:checked]:bg-muted has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20";

function FieldError({ error }: { error?: string[] }) {
  return error?.[0] ? (
    <p className="text-xs font-medium text-ink" role="alert">
      {error[0]}
    </p>
  ) : null;
}

/**
 * A customer's profile (product owner, 2026-10-13): "Whom do you want to become?", gender, date
 * of birth and shoe size. Asked at sign-up and changed on the account page; Browse and the
 * Closet then show pairs in their size, for them, with pairs for who they want to become first.
 */
export function ProfileFields({
  current,
  today,
  errors = {},
}: {
  current?: ProfileUser;
  /** Today in Colombo, "YYYY-MM-DD": the latest date of birth */
  today: string;
  errors?: Record<string, string[] | undefined>;
}) {
  const size = splitShoeSize(current?.shoeSize);
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold tracking-tight">{BECOMING_QUESTION}</legend>
        <p className="-mt-1 text-xs text-subtle">
          Pick one or more. We&apos;ll show you the shoes made for it first.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <label key={p.key} className={cx(pill, "flex flex-col gap-0.5")}>
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="becoming"
                  value={p.key}
                  defaultChecked={current?.becoming.includes(p.key)}
                  className="accent-ink"
                />
                <span className="font-medium">{p.name}</span>
              </span>
              <span className="pl-6 text-xs text-subtle">{p.line}</span>
            </label>
          ))}
        </div>
        <FieldError error={errors.becoming} />
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium">Gender</legend>
        <div className="grid grid-cols-2 gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className={pill}>
              <input
                type="radio"
                name="gender"
                value={g.value}
                defaultChecked={current?.gender === g.value}
                required
                className="sr-only"
              />
              {g.label}
            </label>
          ))}
        </div>
        <FieldError error={errors.gender} />
      </fieldset>

      <Field
        label="Date of birth"
        name="dateOfBirth"
        error={errors.dateOfBirth}
        hint="Under 13s are shown kids' shoes"
      >
        <Input
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          required
          max={today}
          defaultValue={current?.dateOfBirth ? isoDate(current.dateOfBirth) : ""}
          className="w-44"
        />
      </Field>

      <Field
        label="Shoe size"
        name="shoeSizeValue"
        error={errors.shoeSizeValue}
        hint={
          <>
            The size on your shoes&apos; labels. We&apos;ll show you pairs in this size.{" "}
            <Link href="/size-guide" target="_blank" className="underline">
              Size guide
            </Link>
          </>
        }
      >
        <div className="flex gap-2">
          <Select
            name="shoeSizeSystem"
            aria-label="Size system"
            defaultValue={size.system}
            className="w-24"
          >
            {LISTING_SIZE_SYSTEMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input
            name="shoeSizeValue"
            inputMode="decimal"
            required
            pattern="\d{1,2}(\.\d)?"
            placeholder="9"
            defaultValue={size.value}
            className="w-24"
          />
        </div>
      </Field>
    </>
  );
}
