import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { addressSchema, citySchema } from "@/lib/address";
import { MAX_AGE, PERSONA_KEYS, ageOn, isoDate, profileShoeSize } from "@/lib/borrower-profile";
import { colomboDay, dayToDate } from "@/lib/wear-ledger";
import type { Gender, Role, User } from "@/generated/prisma/client";
import { db } from "../db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

export const signUpSchema = z
  .object({
    role: z.enum(["MERCHANT", "BORROWER"]),
    name: z.string().trim().min(2, "Enter your name"),
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    /** The account's one address (deliveries and collections, or pickups and returns) */
    address: addressSchema,
    city: citySchema,
    /** Customers only: their profile (see `readProfile`) */
    dateOfBirth: z.string().trim().optional().or(z.literal("")),
    gender: z.string().optional().or(z.literal("")),
    shoeSizeSystem: z.string().optional().or(z.literal("")),
    shoeSizeValue: z.string().optional().or(z.literal("")),
    becoming: z.array(z.string()).optional(),
    password: z.string().min(8, "Use at least 8 characters"),
    businessName: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.role !== "MERCHANT" || (v.businessName && v.businessName.length >= 2), {
    message: "Enter your business name",
    path: ["businessName"],
  })
  .superRefine((v, ctx) => {
    if (v.role !== "BORROWER") return;
    const read = readProfile(v);
    if ("errors" in read)
      for (const [path, message] of Object.entries(read.errors))
        ctx.addIssue({ code: "custom", message, path: [path] });
  });

/** The form fields of a customer's profile, as typed. */
export type ProfileFields = {
  dateOfBirth?: string;
  gender?: string;
  shoeSizeSystem?: string;
  shoeSizeValue?: string;
  becoming?: string[];
};

export type Profile = {
  dateOfBirth: Date;
  gender: Gender;
  shoeSize: string;
  becoming: string[];
};

/** Today in Colombo as "YYYY-MM-DD". */
export function colomboToday(now = new Date()) {
  return isoDate(dayToDate(colomboDay(now)));
}

/**
 * Checks a customer's profile: date of birth, gender, shoe size and "Whom do you want to
 * become?" (one or more personas). Returns the values to store, or one message per field.
 */
export function readProfile(
  f: ProfileFields,
  today = colomboToday(),
): { profile: Profile } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const dob = f.dateOfBirth?.trim() ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T00:00:00Z`) : null;
  if (!dob) errors.dateOfBirth = "Enter your date of birth";
  else if (!date || Number.isNaN(date.getTime()) || isoDate(date) !== dob)
    errors.dateOfBirth = "Enter a real date";
  else if (dob > today) errors.dateOfBirth = "Your date of birth can't be in the future";
  else if (ageOn(dob, today) > MAX_AGE) errors.dateOfBirth = "Check the year you were born";

  const gender = f.gender === "MALE" || f.gender === "FEMALE" ? f.gender : null;
  if (!gender) errors.gender = "Choose your gender";

  const shoeSize = profileShoeSize(f.shoeSizeSystem ?? "", f.shoeSizeValue ?? "");
  if (!f.shoeSizeValue?.trim()) errors.shoeSizeValue = "Enter your shoe size";
  else if (!shoeSize) errors.shoeSizeValue = "Enter a size such as 9 or 8.5";

  const becoming = [...new Set(f.becoming ?? [])];
  if (becoming.length === 0) errors.becoming = "Choose at least one";
  else if (becoming.some((k) => !PERSONA_KEYS.includes(k)))
    errors.becoming = "Choose from the list";

  if (Object.keys(errors).length > 0) return { errors };
  // Stored in form order.
  const ordered = PERSONA_KEYS.filter((k) => becoming.includes(k));
  return {
    profile: { dateOfBirth: date!, gender: gender!, shoeSize: shoeSize!, becoming: ordered },
  };
}

export type SignUpInput = z.infer<typeof signUpSchema>;

export class AuthError extends Error {}

/** Public sign-up creates merchants and borrowers only; admins are created by seed or other admins. */
export async function registerUser(input: SignUpInput): Promise<User> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AuthError("An account with this email already exists");
  // Customers only: merchants aren't asked. The schema has already checked it.
  let profile: Profile | undefined;
  if (input.role === "BORROWER") {
    const read = readProfile(input);
    if ("errors" in read) throw new AuthError(Object.values(read.errors)[0]);
    profile = read.profile;
  }

  return db.user.create({
    data: {
      role: input.role,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      address: input.address,
      city: input.city,
      ...profile,
      passwordHash: await hashPassword(input.password),
      merchant:
        input.role === "MERCHANT" ? { create: { businessName: input.businessName! } } : undefined,
    },
  });
}

/**
 * Change the account's one address and its city. Trips already booked keep the address they
 * were booked with; every trip booked from now on uses the new one.
 */
export async function updateAddress(userId: string, address: string, city: string) {
  const parsed = z
    .object({ address: addressSchema, city: citySchema })
    .safeParse({ address, city });
  if (!parsed.success) throw new AuthError(parsed.error.issues[0].message);
  return db.user.update({ where: { id: userId }, data: parsed.data });
}

/** A customer changes their profile; nothing already booked changes. */
export async function updateProfile(userId: string, fields: ProfileFields) {
  const read = readProfile(fields);
  if ("errors" in read) return { errors: read.errors };
  await db.user.update({ where: { id: userId, role: "BORROWER" }, data: read.profile });
  return { profile: read.profile };
}

export async function authenticate(email: string, password: string): Promise<User> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Verify against a dummy hash when the user is missing so timing doesn't reveal accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AuthError("Email or password is incorrect");
  if (user.locked) throw new AuthError("This account is locked. Contact support.");
  return user;
}

const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates a session row and returns the raw token for the cookie. */
export async function startSession(userId: string, now = new Date()) {
  const token = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function endSession(token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export type SessionUser = Pick<
  User,
  | "id"
  | "role"
  | "name"
  | "email"
  | "verified"
  | "address"
  | "city"
  | "dateOfBirth"
  | "gender"
  | "shoeSize"
  | "becoming"
>;

export async function userForToken(token: string, now = new Date()): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now || session.user.locked) return null;
  const u = session.user;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    verified: u.verified,
    address: u.address,
    city: u.city,
    dateOfBirth: u.dateOfBirth,
    gender: u.gender,
    shoeSize: u.shoeSize,
    becoming: u.becoming,
  };
}

export function homeFor(role: Role): string {
  return role === "MERCHANT" ? "/merchant" : role === "ADMIN" ? "/admin" : "/browse";
}
