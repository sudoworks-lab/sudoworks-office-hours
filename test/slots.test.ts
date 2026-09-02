import assert from "node:assert/strict";
import { test } from "node:test";
import { RollingSlotCatalogue } from "../src/domain/slots.ts";

test("offers thirty-minute weekday slots from 09:00 to 12:00 JST for fourteen business days", () => {
  const slots = new RollingSlotCatalogue().list(new Date("2026-09-06T00:00:00.000Z"));
  const businessDates = new Set<string>();

  assert.equal(slots.length, 14 * 6);
  assert.equal(slots[0]?.startAt, "2026-09-07T00:00:00.000Z");
  assert.equal(slots.at(-1)?.endAt, "2026-09-24T03:00:00.000Z");

  for (const slot of slots) {
    const start = new Date(slot.startAt);
    const end = new Date(slot.endAt);
    const startInJst = new Date(start.getTime() + 9 * 60 * 60 * 1_000);
    const minuteOfDay = startInJst.getUTCHours() * 60 + startInJst.getUTCMinutes();
    businessDates.add(startInJst.toISOString().slice(0, 10));

    assert.ok(startInJst.getUTCDay() >= 1 && startInJst.getUTCDay() <= 5);
    assert.ok(minuteOfDay >= 9 * 60 && minuteOfDay < 12 * 60);
    assert.ok(startInJst.getUTCMinutes() === 0 || startInJst.getUTCMinutes() === 30);
    assert.equal(end.getTime() - start.getTime(), 30 * 60 * 1_000);
    assert.equal(start.toISOString(), slot.startAt);
    assert.equal(end.toISOString(), slot.endAt);
  }

  assert.equal(businessDates.size, 14);
});
