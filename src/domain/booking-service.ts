import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  InvalidSlotError,
  SlotConflictError,
} from "./errors.ts";
import type {
  BookingConfirmation,
  BookingRepository,
  Clock,
  ContactProtector,
  IdGenerator,
  OfficeHoursSlot,
  SlotCatalogue,
  StoredBooking,
} from "./model.ts";
import { validateBooking } from "./validation.ts";

export interface BookingOutcome {
  booking: BookingConfirmation;
  replayed: boolean;
}

function confirmation(booking: StoredBooking): BookingConfirmation {
  return {
    id: booking.bookingId,
    slotId: booking.slotId,
    startAt: booking.startAt,
    endAt: booking.endAt,
    status: "confirmed",
  };
}

export class BookingService {
  private readonly repository: BookingRepository;
  private readonly protector: ContactProtector;
  private readonly catalogue: SlotCatalogue;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(
    repository: BookingRepository,
    protector: ContactProtector,
    catalogue: SlotCatalogue,
    clock: Clock,
    ids: IdGenerator,
  ) {
    this.repository = repository;
    this.protector = protector;
    this.catalogue = catalogue;
    this.clock = clock;
    this.ids = ids;
  }

  async listSlots(): Promise<readonly OfficeHoursSlot[]> {
    const offered = this.catalogue.list(this.clock.now());
    try {
      const booked = await this.repository.listBookedSlotIds(offered.map((slot) => slot.id));
      return offered.map((slot) => ({ ...slot, available: !booked.has(slot.id) }));
    } catch (error) {
      throw new DependencyUnavailableError(error);
    }
  }

  async book(rawInput: unknown, idempotencyKey: string | undefined): Promise<BookingOutcome> {
    const validated = validateBooking(rawInput, idempotencyKey);
    const slot = this.catalogue
      .list(this.clock.now())
      .find((candidate) => candidate.id === validated.input.slotId);

    if (!slot) throw new InvalidSlotError();

    const protectedContact = this.protector.protect(validated.input.name, validated.input.email);
    const booking: StoredBooking = {
      bookingId: this.ids.next(),
      slotId: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      timezone: validated.input.timezone,
      idempotencyKey: validated.idempotencyKey,
      payloadHash: this.protector.payloadHash(validated.input),
      createdAt: this.clock.now().toISOString(),
      ...protectedContact,
    };

    let result;
    try {
      result = await this.repository.create(booking);
    } catch (error) {
      throw new DependencyUnavailableError(error);
    }

    switch (result.kind) {
      case "created":
        return { booking: confirmation(result.booking), replayed: false };
      case "replay":
        return { booking: confirmation(result.booking), replayed: true };
      case "slot_conflict":
        throw new SlotConflictError();
      case "idempotency_conflict":
        throw new IdempotencyConflictError();
    }
  }

  async ready(): Promise<void> {
    try {
      await this.repository.healthcheck();
    } catch (error) {
      throw new DependencyUnavailableError(error);
    }
  }
}
