import assert from "node:assert/strict";
import { test } from "node:test";
import { BookingService } from "../src/domain/booking-service.ts";
import { OfficeHoursApi } from "../src/http/api.ts";
import { SilentLogger } from "../src/shared/logger.ts";
import {
  fixedCatalogue,
  fixedClock,
  InMemoryBookingRepository,
  protector,
  sequenceIds,
  validInput,
} from "./helpers.ts";

function api(): OfficeHoursApi {
  const service = new BookingService(
    new InMemoryBookingRepository(),
    protector,
    fixedCatalogue,
    fixedClock,
    sequenceIds(),
  );
  return new OfficeHoursApi({ service, logger: new SilentLogger(), storageKind: "sqlite", runtimeKind: "local" });
}

test("HTTP booking responses distinguish creation, replay, and conflict", async () => {
  const target = api();
  const request = {
    method: "POST",
    path: "/api/bookings",
    headers: { "content-type": "application/json", "idempotency-key": "http-idempotency-01", host: "localhost" },
    body: JSON.stringify(validInput),
    remoteAddress: "127.0.0.1",
  };
  const created = await target.handle(request);
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(created.body).replayed, false);
  assert.equal(JSON.parse(created.body).booking.status, "requested");

  const replay = await target.handle(request);
  assert.equal(replay.status, 200);
  assert.equal(JSON.parse(replay.body).replayed, true);

  const conflict = await target.handle({
    ...request,
    headers: { ...request.headers, "idempotency-key": "http-idempotency-02" },
  });
  assert.equal(conflict.status, 409);
  assert.equal(JSON.parse(conflict.body).error.code, "SLOT_ALREADY_BOOKED");
});

test("HTTP layer bounds content, media type, origin, and malformed JSON errors", async () => {
  const target = api();
  const base = { method: "POST", path: "/api/bookings", remoteAddress: "198.51.100.1" };
  const unsupported = await target.handle({ ...base, headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(unsupported.status, 415);
  assert.equal(JSON.parse(unsupported.body).error.code, "UNSUPPORTED_MEDIA_TYPE");

  const crossSite = await target.handle({
    ...base,
    headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
    body: JSON.stringify(validInput),
  });
  assert.equal(crossSite.status, 403);
  assert.equal(JSON.parse(crossSite.body).error.code, "ORIGIN_NOT_ALLOWED");

  const malformed = await target.handle({
    ...base,
    headers: { "content-type": "application/json", "idempotency-key": "malformed-json-001" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal(JSON.parse(malformed.body).error.code, "INVALID_INPUT");

  const oversized = await target.handle({
    ...base,
    headers: { "content-type": "application/json", "idempotency-key": "oversized-body-001" },
    body: "x".repeat(16 * 1_024 + 1),
  });
  assert.equal(oversized.status, 413);
  assert.equal(JSON.parse(oversized.body).error.code, "PAYLOAD_TOO_LARGE");
});
