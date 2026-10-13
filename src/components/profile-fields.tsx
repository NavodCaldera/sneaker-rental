"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BECOMING_PLACEHOLDER,
  BECOMING_HINT,
  birthdayReason,
  BECOMING_MAX,
  BECOMING_MIN,
  BECOMING_QUESTION,
  GENDERS,
  isoDate,
  profileShoeSize,
  shoeSizeExists,
  shoeSizeProblem,
  splitShoeSize,
  type ProfileUser,
} from "@/lib/borrower-profile";
import { LISTING_SIZE_SYSTEMS } from "@/lib/shoe-size";
import { Field, Input, Select, Textarea } from "./ui";

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
  const [gender, setGender] = useState(current?.gender ?? "");
  const [dob, setDob] = useState(current?.dateOfBirth ? isoDate(current.dateOfBirth) : "");
  const [system, setSystem] = useState<string>(size.system);
  const [value, setValue] = useState(size.value);
  const sizeInput = useRef<HTMLInputElement>(null);

  // The size is checked as it is typed, against the chart for their gender (and kids' range
  // for under 13s), so a wrong size is refused before the form is sent. The server checks again.
  const label = profileShoeSize(system, value);
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob <= today;
  const detail =
    label && validDob && (gender === "MALE" || gender === "FEMALE")
      ? shoeSizeProblem(label, gender, dob, today)
      : null;
  // Until gender and date of birth are known, a size that exists for no one is still refused.
  const invalid = Boolean(detail) || (label !== null && !shoeSizeExists(label));
  useEffect(() => {
    sizeInput.current?.setCustomValidity(invalid ? "Invalid Size" : "");
  }, [invalid]);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="becomingStory" className="text-sm font-bold">
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
          placeholder={BECOMING_PLACEHOLDER}
        />
        <FieldError error={errors.becomingStory} />
      </div>

      <Field label="Gender" name="gender" error={errors.gender}>
        <Select
          name="gender"
          required
          value={gender}
          onChange={(e) => setGender(e.target.value as typeof gender)}
        >
          <option value="" disabled>
            Select gender
          </option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>

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
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-44"
        />
      </Field>

      <Field
        label="Shoe size"
        name="shoeSizeValue"
        error={invalid ? undefined : errors.shoeSizeValue}
        hint={
          <Link href="/size-guide" target="_blank" className="underline">
            Size guide
          </Link>
        }
      >
        <div className="flex gap-2">
          <Select
            name="shoeSizeSystem"
            aria-label="Size system"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            className="w-24"
          >
            {LISTING_SIZE_SYSTEMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input
            ref={sizeInput}
            name="shoeSizeValue"
            inputMode="decimal"
            required
            pattern="\d{1,2}(\.\d)?"
            placeholder="9"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24"
          />
        </div>
        {invalid && (
          <div role="alert" className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-red-600 dark:text-red-400" style={{ color: "red" }}>
              Invalid Size
            </p>
            {detail && <p className="text-xs text-subtle">{detail}</p>}
          </div>
        )}
      </Field>
    </>
  );
}
