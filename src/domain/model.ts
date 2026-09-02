export interface OfficeHoursSlot {
  id: string;
  startAt: string;
  endAt: string;
  available: boolean;
}

export interface BookingInput {
  name: string;
  email: string;
  slotId: string;
  timezone: string;
  privacyConsent: true;
}

export interface ProtectedContact {
  encryptedName: string;
  encryptedEmail: string;
  emailHash: string;
}

export interface StoredBooking extends ProtectedContact {
  bookingId: string;
  slotId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  idempotencyKey: string;
  payloadHash: string;
  createdAt: string;
}

export interface BookingConfirmation {
  id: string;
  slotId: string;
  startAt: string;
  endAt: string;
  status: "confirmed";
}

export type CreateBookingResult =
  | { kind: "created"; booking: StoredBooking }
  | { kind: "replay"; booking: StoredBooking }
  | { kind: "slot_conflict" }
  | { kind: "idempotency_conflict" };

export interface BookingRepository {
  create(booking: StoredBooking): Promise<CreateBookingResult>;
  listBookedSlotIds(slotIds: readonly string[]): Promise<ReadonlySet<string>>;
  healthcheck(): Promise<void>;
}

export interface ContactProtector {
  protect(name: string, email: string): ProtectedContact;
  payloadHash(input: BookingInput): string;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface SlotCatalogue {
  list(now: Date): readonly Omit<OfficeHoursSlot, "available">[];
}
