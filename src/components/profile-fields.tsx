import Link from "next/link";
import {
  BECOMING_EXAMPLE,
  BECOMING_HINT,
  birthdayReason,
  BECOMING_MAX,
  BECOMING_MIN,
  BECOMING_QUESTION,
  GENDERS,
  isoDate,
  splitShoeSize,
  type ProfileUser,
} from "@/lib/borrower-profile";
import { LISTING_SIZE_SYSTEMS } from "@/lib/shoe-size";
import { Field, Input, Select, Textarea } from "./ui";

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
 * A customer's profile (product owner, 2026-10-13): "Whom do you want to become?" in their own
 * words, gender, date of birth and shoe size. Asked at sign-up and changed on the account page; Browse and the
 * Closet then show pairs in their size, for them, with pairs for who they want to become first.
 */
export function ProfileFields({
  current,
  today,
  birthdayFreePairs,
  errors = {},
}: {
  current?: ProfileUser;
  /** Pairs rent-free in the birthday month (settings), for the reason we give */
  birthdayFreePairs: number;
  /** Today in Colombo, "YYYY-MM-DD": the latest date of birth */
  today: string;
  errors?: Record<string, string[] | undefined>;
}) {
  const size = splitShoeSize(current?.shoeSize);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="becomingStory" className="text-base font-semibold tracking-tight">
          {BECOMING_QUESTION}
        </label>
        <p className="text-xs text-subtle">{BECOMING_HINT}</p>
        <Textarea
          name="becomingStory"
          rows={4}
          required
          minLength={BECOMING_MIN}
          maxLength={BECOMING_MAX}
          defaultValue={current?.becomingStory ?? ""}
          placeholder={`${BECOMING_EXAMPLE}. People see me as sharp, calm and always ready.`}
        />
        <FieldError error={errors.becomingStory} />
      </div>

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
        hint={birthdayReason(birthdayFreePairs)}
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
