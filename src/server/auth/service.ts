import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { addressSchema, citySchema } from "@/lib/address";
import type { Role, User } from "@/generated/prisma/client";
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
    password: z.string().min(8, "Use at least 8 characters"),
    businessName: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.role !== "MERCHANT" || (v.businessName && v.businessName.length >= 2), {
    message: "Enter your business name",
    path: ["businessName"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

export class AuthError extends Error {}

/** Public sign-up creates merchants and borrowers only; admins are created by seed or other admins. */
export async function registerUser(input: SignUpInput): Promise<User> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AuthError("An account with this email already exists");

  return db.user.create({
    data: {
      role: input.role,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      address: input.address,
      city: input.city,
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
  "id" | "role" | "name" | "email" | "verified" | "address" | "city"
>;

export async function userForToken(token: string, now = new Date()): Promise<SessionUser | null> {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= now || session.user.locked) return null;
  const { id, role, name, email, verified, address, city } = session.user;
  return { id, role, name, email, verified, address, city };
}

export function homeFor(role: Role): string {
  return role === "MERCHANT" ? "/merchant" : role === "ADMIN" ? "/admin" : "/browse";
}
