import { ValidationError } from "./errors.ts";
import type { BookingInput } from "./model.ts";

const EXPECTED_FIELDS = new Set([
  "name",
  "email",
  "slotId",
  "timezone",
  "privacyConsent",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;

export interface ValidatedBooking {
  input: BookingInput;
  idempotencyKey: string;
}

function isSupportedTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateBooking(
  value: unknown,
  idempotencyKeyValue: string | undefined,
): ValidatedBooking {
  const fields: Record<string, string> = {};

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError({ body: "Send a JSON object." });
  }

  const record = value as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter((key) => !EXPECTED_FIELDS.has(key));
  if (unknownFields.length > 0) {
    fields.body = `Unknown field${unknownFields.length === 1 ? "" : "s"}: ${unknownFields.join(", ")}.`;
  }

  const rawName = record.name;
  const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/gu, " ") : "";
  if (name.length < 2 || name.length > 80 || (typeof rawName === "string" && CONTROL_CHARACTER_PATTERN.test(rawName))) {
    fields.name = "Use 2–80 characters without control characters.";
  }

  const rawEmail = record.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    fields.email = "Enter a valid email address of at most 254 characters.";
  }

  const rawSlotId = record.slotId;
  const slotId = typeof rawSlotId === "string" ? rawSlotId.trim() : "";
  if (slotId.length < 8 || slotId.length > 80 || !/^slot_[A-Za-z0-9:._-]+$/u.test(slotId)) {
    fields.slotId = "Choose a valid Office Hours slot.";
  }

  const rawTimezone = record.timezone;
  const timezone = typeof rawTimezone === "string" ? rawTimezone.trim() : "";
  if (timezone.length < 1 || timezone.length > 64 || !isSupportedTimezone(timezone)) {
    fields.timezone = "Use a valid IANA timezone.";
  }

  if (record.privacyConsent !== true) {
    fields.privacyConsent = "Consent is required to store the booking details.";
  }

  const idempotencyKey = idempotencyKeyValue?.trim() ?? "";
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    fields.idempotencyKey = "Provide a 16–128 character Idempotency-Key using letters, numbers, _ or -.";
  }

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);

  return {
    input: {
      name,
      email,
      slotId,
      timezone,
      privacyConsent: true,
    },
    idempotencyKey,
  };
}
