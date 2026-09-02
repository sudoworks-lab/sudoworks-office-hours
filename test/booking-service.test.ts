import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BookingService } from "../src/domain/booking-service.ts";
import { AppError } from "../src/domain/errors.ts";
import type { BookingRepository } from "../src/domain/model.ts";
import {
  fixedCatalogue,
  fixedClock,
  InMemoryBookingRepository,
  protector,
  sequenceIds,
  validInput,
} from "./helpers.ts";

function service(repository: BookingRepository = new InMemoryBookingRepository()): BookingService {
  return new BookingService(repository, protector, fixedCatalogue, fixedClock, sequenceIds());
}

async function expectAppError(operation: Promise<unknown>, code: string, status: number): Promise<AppError> {
  try {
    await operation;
    assert.fail("Expected operation to reject.");
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
}

describe("BookingService", () => {
  test("creates a successful booking without returning contact details", async () => {
    const result = await service().book(validInput, "idem-success-0001");
    assert.equal(result.replayed, false);
    assert.deepEqual(result.booking, {
      id: "booking-1",
      slotId: validInput.slotId,
      startAt: "2030-01-03T09:00:00.000Z",
      endAt: "2030-01-03T09:30:00.000Z",
      status: "confirmed",
    });
    assert.equal("email" in result.booking, false);
    assert.equal("name" in result.booking, false);
  });

  test("replays the original booking for a duplicate key and identical payload", async () => {
    const target = service();
    const first = await target.book(validInput, "idem-replay-00001");
    const replay = await target.book(validInput, "idem-replay-00001");
    assert.equal(replay.replayed, true);
    assert.equal(replay.booking.id, first.booking.id);
  });

  test("rejects reuse of an idempotency key with a different payload", async () => {
    const target = service();
    await target.book(validInput, "idem-mismatch-001");
    await expectAppError(
      target.book({ ...validInput, name: "Different Person" }, "idem-mismatch-001"),
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
  });

  test("allows exactly one winner under conflicting concurrent attempts", async () => {
    const target = service();
    const attempts = Array.from({ length: 12 }, (_, index) =>
      target.book(validInput, `concurrent-key-${String(index).padStart(3, "0")}`));
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 11);
    for (const result of rejected) {
      assert.ok(result.reason instanceof AppError);
      assert.equal(result.reason.code, "SLOT_ALREADY_BOOKED");
    }
  });

  test("returns explicit validation fields for invalid input", async () => {
    const error = await expectAppError(
      service().book({ name: "", email: "bad", slotId: "x", timezone: "Nowhere/Invalid", privacyConsent: false }, "short"),
      "INVALID_INPUT",
      400,
    );
    assert.deepEqual(Object.keys(error.fields ?? {}).sort(), [
      "email",
      "idempotencyKey",
      "name",
      "privacyConsent",
      "slotId",
      "timezone",
    ]);
  });

  test("maps persistence failures to a retryable service-unavailable error", async () => {
    const unavailable: BookingRepository = {
      create: async () => { throw new Error("database offline"); },
      listBookedSlotIds: async () => { throw new Error("database offline"); },
      healthcheck: async () => { throw new Error("database offline"); },
    };
    const target = service(unavailable);
    const bookingError = await expectAppError(target.book(validInput, "storage-error-0001"), "SERVICE_UNAVAILABLE", 503);
    assert.equal(bookingError.retryable, true);
    await expectAppError(target.listSlots(), "SERVICE_UNAVAILABLE", 503);
    await expectAppError(target.ready(), "SERVICE_UNAVAILABLE", 503);
  });
});
