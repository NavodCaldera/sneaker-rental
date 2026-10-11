import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { checkout } from "@/server/booking/checkout";
import { endRental, recordCondition } from "@/server/booking/lifecycle";
import {
  LogisticsError,
  applyTripEvent,
  bookDelivery,
  courierDropoff,
  courierPickup,
  deliveryForToken,
  setQuote,
  updateStatus,
} from "@/server/logistics";
import { arrive, day, deliveryFor, makeShoe, makeUser, photos, resetDb, setup } from "./helpers";

beforeEach(resetDb);

const photo = () => photos()[0];

async function bookedRental() {
  const ctx = await setup();
  const shoe = await makeShoe(ctx.merchantId);
  const rental = await checkout(ctx.borrower.id, [shoe.id], {
    deliveryAddress: "22 Flower Rd",
    plannedDays: 14,
  });
  const item = await db.rentalItem.findFirstOrThrow({ where: { rentalId: rental.id } });
  const delivery = await deliveryFor(item.id, "DELIVER");
  return { ...ctx, shoe, rental, item, delivery };
}

describe("manual provider: quote → book → courier pickup → drop-off", () => {
  it("moves the shoe and starts the clock; the trip fee is the receiver's to pay the driver", async () => {
    const { shoe, rental, item, delivery } = await bookedRental();
    expect(delivery.status).toBe("REQUESTED");
    expect(delivery.fromAddress).toMatch(/Galle Road/);
    expect(delivery.toAddress).toBe("22 Flower Rd");

    await setQuote(delivery.id, "450");
    const token = await bookDelivery(delivery.id, "admin", day(0));
    const viaLink = await deliveryForToken(token, day(0));
    expect(viaLink?.id).toBe(delivery.id);
    expect(
      (await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).courierTokenHash,
    ).not.toBe(token);

    await courierPickup(token, { photo: photo(), sealedBag: true, cleaningKit: false }, day(0));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe(
      "OUT_FOR_DELIVERY",
    );

    await courierDropoff(token, { photo: photo() }, day(1));
    const active = await db.rentalItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(active.status).toBe("ACTIVE");
    expect(active.startDate!.getTime()).toBe(day(1).getTime());
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe(
      "WITH_BORROWER",
    );

    // Not handled by us: no tokens move for the trip, the borrower pays the driver (and the
    // rent is only charged when the pair is back).
    expect(delivery.paidBy).toBe("BORROWER");
    expect(await db.walletEntry.count({ where: { rentalId: rental.id, kind: "CHARGE" } })).toBe(0);

    const done = await db.delivery.findUniqueOrThrow({
      where: { id: delivery.id },
      include: { photos: true },
    });
    expect(done.photos.map((p) => p.kind).sort()).toEqual(["DRIVER_DROPOFF", "DRIVER_PICKUP"]);
    expect((done.tripLog as { status: string }[]).map((e) => e.status)).toEqual([
      "REQUESTED",
      "QUOTED",
      "BOOKED",
      "PICKED_UP",
      "DELIVERED",
    ]);
  });

  it("courier links only work for their own trip and step, and expire", async () => {
    const { delivery } = await bookedRental();
    const token = await bookDelivery(delivery.id, "admin", day(0));
    await expect(courierDropoff(token, { photo: photo() }, day(0))).rejects.toThrow(LogisticsError);
    await expect(
      courierPickup(
        "someone-elses-token",
        { photo: photo(), sealedBag: true, cleaningKit: false },
        day(0),
      ),
    ).rejects.toThrow(LogisticsError);
    await expect(
      courierPickup(token, { photo: photo(), sealedBag: false, cleaningKit: false }, day(0)),
    ).rejects.toThrow(/sealed bag/);
    expect(await deliveryForToken(token, day(4))).toBeNull(); // 3-day link
  });

  it("rejects impossible status moves and ignores repeated events", async () => {
    const { delivery } = await bookedRental();
    await expect(updateStatus(delivery.id, "DELIVERED", "admin")).rejects.toThrow(/Can't move/);
    await bookDelivery(delivery.id);
    await db.delivery.update({ where: { id: delivery.id }, data: { externalRef: "trip_abc" } });
    await applyTripEvent({ externalRef: "trip_abc", status: "PICKED_UP", at: day(0) });
    expect(
      await applyTripEvent({ externalRef: "trip_abc", status: "PICKED_UP", at: day(0) }),
    ).toBeNull();
    await applyTripEvent({ externalRef: "trip_abc", status: "DELIVERED", at: day(1) });
    expect((await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe(
      "DELIVERED",
    );
    await expect(
      applyTripEvent({ externalRef: "nope", status: "DELIVERED", at: day(1) }),
    ).rejects.toThrow(/Unknown trip/);
  });
});

describe("handoff trips", () => {
  it("need the cleaning kit confirmed and close the previous borrower's rental on receipt", async () => {
    const { borrower, merchantId } = await setup();
    const next = await makeUser("BORROWER");
    const shoe = await makeShoe(merchantId);
    const r1 = await checkout(
      borrower.id,
      [shoe.id],
      { deliveryAddress: "First home", plannedDays: 10 },
      day(-1),
    );
    const item1 = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r1.id } });
    await arrive(await deliveryFor(item1.id, "DELIVER"), day(0));
    const r2 = await checkout(
      next.id,
      [shoe.id],
      { deliveryAddress: "Second home", plannedDays: 10 },
      day(1),
    );
    const item2 = await db.rentalItem.findFirstOrThrow({ where: { rentalId: r2.id } });

    await endRental(borrower.id, item1.id, day(10));
    const handoff = await deliveryFor(item2.id, "HANDOFF");
    const token = await bookDelivery(handoff.id, "admin", day(10));
    await expect(
      courierPickup(token, { photo: photo(), sealedBag: true, cleaningKit: false }, day(11)),
    ).rejects.toThrow(/cleaning kit/);
    await courierPickup(token, { photo: photo(), sealedBag: true, cleaningKit: true }, day(11));
    expect((await db.shoe.findUniqueOrThrow({ where: { id: shoe.id } })).status).toBe("IN_HANDOFF");
    await courierDropoff(token, { photo: photo() }, day(11));

    await recordCondition(next.id, { itemId: item2.id, grade: "A", photos: photos() }, day(11));
    const closed = await db.rentalItem.findUniqueOrThrow({ where: { id: item1.id } });
    expect(closed.status).toBe("CLOSED");
    // Days 1–10: the term's last day was day 10; the handoff trip on day 11 is free.
    expect(closed.wearEnd!.toString()).toBe("10");
  });
});
