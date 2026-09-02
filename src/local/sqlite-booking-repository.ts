import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  BookingRepository,
  CreateBookingResult,
  StoredBooking,
} from "../domain/model.ts";

interface BookingRow {
  booking_id: string;
  slot_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  idempotency_key: string;
  payload_hash: string;
  encrypted_name: string;
  encrypted_email: string;
  email_hash: string;
  created_at: string;
}

function storedBooking(row: BookingRow): StoredBooking {
  return {
    bookingId: row.booking_id,
    slotId: row.slot_id,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    encryptedName: row.encrypted_name,
    encryptedEmail: row.encrypted_email,
    emailHash: row.email_hash,
    createdAt: row.created_at,
  };
}

export class SqliteBookingRepository implements BookingRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    const absolutePath = resolve(databasePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    this.database = new DatabaseSync(absolutePath);
    chmodSync(absolutePath, 0o600);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        booking_id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL UNIQUE,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        timezone TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload_hash TEXT NOT NULL,
        encrypted_name TEXT NOT NULL,
        encrypted_email TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS bookings_email_hash_idx ON bookings(email_hash);
    `);
  }

  async create(booking: StoredBooking): Promise<CreateBookingResult> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const byIdempotency = this.database.prepare(
        "SELECT * FROM bookings WHERE idempotency_key = ?",
      ).get(booking.idempotencyKey) as BookingRow | undefined;

      if (byIdempotency) {
        this.database.exec("COMMIT");
        if (byIdempotency.payload_hash === booking.payloadHash) {
          return { kind: "replay", booking: storedBooking(byIdempotency) };
        }
        return { kind: "idempotency_conflict" };
      }

      const bySlot = this.database.prepare(
        "SELECT booking_id FROM bookings WHERE slot_id = ?",
      ).get(booking.slotId);
      if (bySlot) {
        this.database.exec("COMMIT");
        return { kind: "slot_conflict" };
      }

      this.database.prepare(`
        INSERT INTO bookings (
          booking_id, slot_id, start_at, end_at, timezone,
          idempotency_key, payload_hash, encrypted_name,
          encrypted_email, email_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        booking.bookingId,
        booking.slotId,
        booking.startAt,
        booking.endAt,
        booking.timezone,
        booking.idempotencyKey,
        booking.payloadHash,
        booking.encryptedName,
        booking.encryptedEmail,
        booking.emailHash,
        booking.createdAt,
      );
      this.database.exec("COMMIT");
      return { kind: "created", booking };
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original storage failure.
      }
      throw error;
    }
  }

  async listBookedSlotIds(slotIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (slotIds.length === 0) return new Set();
    const placeholders = slotIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(`SELECT slot_id FROM bookings WHERE slot_id IN (${placeholders})`)
      .all(...slotIds) as { slot_id: string }[];
    return new Set(rows.map((row) => row.slot_id));
  }

  async healthcheck(): Promise<void> {
    this.database.prepare("SELECT 1 AS ok").get();
  }

  close(): void {
    this.database.close();
  }
}
