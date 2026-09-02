import type {
  BookingRepository,
  Clock,
  ContactProtector,
  CreateBookingResult,
  IdGenerator,
  SlotCatalogue,
  StoredBooking,
} from "../src/domain/model.ts";
import { createContactProtector, keyFromSecret } from "../src/shared/contact-protector.ts";

export const fixedNow = new Date("2030-01-01T00:00:00.000Z");
export const fixedSlot = {
  id: "slot_2030-01-03T09-00-00Z",
  startAt: "2030-01-03T09:00:00.000Z",
  endAt: "2030-01-03T09:30:00.000Z",
};

export const fixedClock: Clock = { now: () => new Date(fixedNow) };
export const fixedCatalogue: SlotCatalogue = { list: () => [fixedSlot] };
export const protector: ContactProtector = createContactProtector(keyFromSecret("test-key-material-with-more-than-32-characters"));

export function sequenceIds(prefix = "booking"): IdGenerator {
  let current = 0;
  return { next: () => `${prefix}-${++current}` };
}

export const validInput = {
  name: "Avery Operator",
  email: "avery@example.test",
  slotId: fixedSlot.id,
  timezone: "UTC",
  privacyConsent: true,
} as const;

export class InMemoryBookingRepository implements BookingRepository {
  readonly bySlot = new Map<string, StoredBooking>();
  readonly byIdempotency = new Map<string, StoredBooking>();

  async create(booking: StoredBooking): Promise<CreateBookingResult> {
    const byKey = this.byIdempotency.get(booking.idempotencyKey);
    if (byKey) {
      return byKey.payloadHash === booking.payloadHash
        ? { kind: "replay", booking: byKey }
        : { kind: "idempotency_conflict" };
    }
    if (this.bySlot.has(booking.slotId)) return { kind: "slot_conflict" };
    this.bySlot.set(booking.slotId, booking);
    this.byIdempotency.set(booking.idempotencyKey, booking);
    return { kind: "created", booking };
  }

  async listBookedSlotIds(slotIds: readonly string[]): Promise<ReadonlySet<string>> {
    return new Set(slotIds.filter((id) => this.bySlot.has(id)));
  }

  async healthcheck(): Promise<void> {}
}

export function storedBooking(overrides: Partial<StoredBooking> = {}): StoredBooking {
  return {
    bookingId: "booking-1",
    slotId: fixedSlot.id,
    startAt: fixedSlot.startAt,
    endAt: fixedSlot.endAt,
    timezone: "UTC",
    idempotencyKey: "idem-key-00000001",
    payloadHash: "payload-hash-1",
    encryptedName: "encrypted-name",
    encryptedEmail: "encrypted-email",
    emailHash: "email-hash",
    createdAt: fixedNow.toISOString(),
    ...overrides,
  };
}
