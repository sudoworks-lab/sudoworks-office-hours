import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { SqliteBookingRepository } from "../src/local/sqlite-booking-repository.ts";
import { storedBooking } from "./helpers.ts";

test("SQLite persists bookings across repository restarts and preserves idempotent replay", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "office-hours-persistence-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "bookings.sqlite");
  const booking = storedBooking();

  const firstRepository = new SqliteBookingRepository(databasePath);
  assert.equal((await stat(databasePath)).mode & 0o777, 0o600);
  assert.equal((await firstRepository.create(booking)).kind, "created");
  firstRepository.close();

  const secondRepository = new SqliteBookingRepository(databasePath);
  context.after(() => secondRepository.close());
  assert.deepEqual([...await secondRepository.listBookedSlotIds([booking.slotId])], [booking.slotId]);
  const replay = await secondRepository.create({ ...booking, bookingId: "a-new-generated-id" });
  assert.equal(replay.kind, "replay");
  if (replay.kind === "replay") assert.equal(replay.booking.bookingId, booking.bookingId);
});

test("SQLite rejects a conflicting owner, including across repository connections", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "office-hours-conflict-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "bookings.sqlite");
  const firstRepository = new SqliteBookingRepository(databasePath);
  const secondRepository = new SqliteBookingRepository(databasePath);
  context.after(() => {
    firstRepository.close();
    secondRepository.close();
  });

  const results = await Promise.all([
    firstRepository.create(storedBooking({ bookingId: "winner", idempotencyKey: "first-owner-key-01" })),
    secondRepository.create(storedBooking({ bookingId: "loser", idempotencyKey: "second-owner-key-1", payloadHash: "payload-hash-2" })),
  ]);
  assert.deepEqual(results.map((result) => result.kind).sort(), ["created", "slot_conflict"]);
});
