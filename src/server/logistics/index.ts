import "server-only";
import type { Delivery, DeliveryStatus, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { hashToken, newToken } from "../auth/service";
import { onDeliveryDelivered, onDeliveryPickedUp } from "../booking/lifecycle";
import { chargeDeliveryFee } from "../payments";
import { checkPhoto, savePhoto } from "../storage";
import { provider } from "./provider";

export class LogisticsError extends Error {}

export const COURIER_LINK_DAYS = 3;

/** Allowed status moves. Manual admins and couriers follow the same path. */
const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  REQUESTED: ["QUOTED", "BOOKED", "CANCELLED"],
  QUOTED: ["BOOKED", "CANCELLED"],
  BOOKED: ["PICKED_UP", "CANCELLED", "FAILED"],
  PICKED_UP: ["DELIVERED", "FAILED"],
  FAILED: ["BOOKED"],
};

type LogEntry = { at: string; status: string; by: string; note?: string };

function appendLog(delivery: Delivery, entry: LogEntry): Prisma.InputJsonValue {
  const log = Array.isArray(delivery.tripLog) ? (delivery.tripLog as LogEntry[]) : [];
  return [...log, entry];
}

/** The admin enters the ride-hailing app's quote for the trip fee (passes through to them). */
export async function setQuote(deliveryId: string, quote: string, by = "admin") {
  if (!/^\d+(\.\d{1,2})?$/.test(quote.trim())) throw new LogisticsError("Enter the quote in LKR");
  const delivery = await db.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (!["REQUESTED", "QUOTED"].includes(delivery.status)) {
    throw new LogisticsError("The quote can only change before the trip is booked");
  }
  return db.delivery.update({
    where: { id: deliveryId },
    data: {
      quote: quote.trim(),
      status: "QUOTED",
      tripLog: appendLog(delivery, {
        at: new Date().toISOString(),
        status: "QUOTED",
        by,
        note: `LKR ${quote}`,
      }),
    },
  });
}

/**
 * Books the trip with the provider and creates the courier link. The raw token is returned
 * once, for the admin to send to the driver; only its hash is stored.
 */
export async function bookDelivery(deliveryId: string, by = "admin", now = new Date()) {
  const delivery = await db.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (!["REQUESTED", "QUOTED", "FAILED"].includes(delivery.status)) {
    throw new LogisticsError("This trip is already booked");
  }
  const { externalRef } = await provider().book({
    deliveryId,
    from: delivery.fromAddress,
    to: delivery.toAddress,
    type: delivery.type,
  });
  const token = newToken();
  await db.delivery.update({
    where: { id: deliveryId },
    data: {
      status: "BOOKED",
      bookedAt: now,
      externalRef,
      courierTokenHash: hashToken(token),
      courierTokenExpiry: new Date(now.getTime() + COURIER_LINK_DAYS * 86_400_000),
      tripLog: appendLog(delivery, { at: now.toISOString(), status: "BOOKED", by }),
    },
  });
  return token;
}

/** A fresh courier link (e.g. the driver changed). The old one stops working. */
export async function renewCourierLink(deliveryId: string, now = new Date()) {
  const delivery = await db.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
  if (!["BOOKED", "PICKED_UP"].includes(delivery.status))
    throw new LogisticsError("Trip isn't in progress");
  const token = newToken();
  await db.delivery.update({
    where: { id: deliveryId },
    data: {
      courierTokenHash: hashToken(token),
      courierTokenExpiry: new Date(now.getTime() + COURIER_LINK_DAYS * 86_400_000),
    },
  });
  return token;
}

/**
 * Moves a trip to its next status and tells booking: picked up (shoe in transit) or
 * delivered (holding starts / stops). Delivery fees are charged on delivery.
 */
export async function updateStatus(
  deliveryId: string,
  status: DeliveryStatus,
  by: string,
  options: { at?: Date; note?: string } = {},
) {
  const at = options.at ?? new Date();
  const updated = await db.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    if (delivery.status === status) return null; // repeated event: no-op
    if (!NEXT[delivery.status]?.includes(status)) {
      throw new LogisticsError(
        `Can't move a ${delivery.status.toLowerCase()} trip to ${status.toLowerCase()}`,
      );
    }
    const updated = await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        status,
        ...(status === "PICKED_UP" && { pickedUpAt: at }),
        ...(status === "DELIVERED" && { deliveredAt: at, courierTokenExpiry: at }),
        tripLog: appendLog(delivery, { at: at.toISOString(), status, by, note: options.note }),
      },
    });
    if (status === "PICKED_UP") await onDeliveryPickedUp(tx, updated);
    if (status === "DELIVERED") await onDeliveryDelivered(tx, updated, at);
    return updated;
  });
  if (updated?.status === "DELIVERED") await chargeDeliveryFee(updated.id);
  return updated;
}

// ─── Courier link (no account) ─────────────────────────────────────────────

export async function deliveryForToken(token: string, now = new Date()) {
  const delivery = await db.delivery.findUnique({
    where: { courierTokenHash: hashToken(token) },
    include: {
      photos: true,
      rentalItem: { include: { shoe: { select: { brand: true, model: true, size: true } } } },
    },
  });
  if (!delivery || !delivery.courierTokenExpiry) return null;
  // Delivered trips stay viewable (read-only) for a day after drop-off.
  const viewableUntil =
    delivery.status === "DELIVERED"
      ? delivery.courierTokenExpiry.getTime() + 86_400_000
      : delivery.courierTokenExpiry.getTime();
  if (now.getTime() > viewableUntil) return null;
  return delivery;
}

/** Driver at pickup: photograph the sealed bag; handoffs also confirm the cleaning kit. */
export async function courierPickup(
  token: string,
  input: { photo: File; sealedBag: boolean; cleaningKit: boolean },
  now = new Date(),
) {
  const delivery = await deliveryForToken(token, now);
  if (!delivery || delivery.status !== "BOOKED")
    throw new LogisticsError("This link isn't valid for a pickup");
  if (!input.sealedBag) throw new LogisticsError("Confirm the pair is in a sealed bag");
  if (delivery.type === "HANDOFF" && !input.cleaningKit)
    throw new LogisticsError("Confirm the cleaning kit is in the bag");
  checkPhoto(input.photo, "Pickup");
  const saved = await savePhoto(input.photo, `deliveries/${delivery.id}`);
  await db.delivery.update({
    where: { id: delivery.id },
    data: {
      sealedBagConfirmed: true,
      cleaningKitConfirmed: input.cleaningKit,
      photos: { create: { kind: "DRIVER_PICKUP", ...saved } },
    },
  });
  return updateStatus(delivery.id, "PICKED_UP", "courier", { at: now });
}

/** Driver at drop-off: photograph the sealed bag at the door. */
export async function courierDropoff(token: string, input: { photo: File }, now = new Date()) {
  const delivery = await deliveryForToken(token, now);
  if (!delivery || delivery.status !== "PICKED_UP")
    throw new LogisticsError("This link isn't valid for a drop-off");
  checkPhoto(input.photo, "Drop-off");
  const saved = await savePhoto(input.photo, `deliveries/${delivery.id}`);
  await db.delivery.update({
    where: { id: delivery.id },
    data: { photos: { create: { kind: "DRIVER_DROPOFF", ...saved } } },
  });
  return updateStatus(delivery.id, "DELIVERED", "courier", { at: now });
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

export async function applyTripEvent(event: {
  externalRef: string;
  status: DeliveryStatus;
  at: Date;
}) {
  const delivery = await db.delivery.findFirst({ where: { externalRef: event.externalRef } });
  if (!delivery) throw new LogisticsError("Unknown trip");
  return updateStatus(delivery.id, event.status, "webhook", { at: event.at });
}

// ─── Admin queries ─────────────────────────────────────────────────────────

export async function listDeliveries(scope: "open" | "done") {
  return db.delivery.findMany({
    where:
      scope === "open"
        ? { status: { in: ["REQUESTED", "QUOTED", "BOOKED", "PICKED_UP", "FAILED"] } }
        : { status: { in: ["DELIVERED", "CANCELLED"] } },
    orderBy: { createdAt: scope === "open" ? "asc" : "desc" },
    take: scope === "open" ? undefined : 50,
    include: {
      photos: { select: { id: true, kind: true } },
      rentalItem: {
        include: {
          shoe: { select: { brand: true, model: true, size: true } },
          rental: { include: { borrower: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
}
