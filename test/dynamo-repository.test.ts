import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { DynamoBookingRepository } from "../src/aws/dynamo-booking-repository.ts";
import { storedBooking } from "./helpers.ts";

test("DynamoDB claims slot, idempotency key, and booking in one conditional transaction", async () => {
  let captured: TransactWriteItemsCommand | undefined;
  const client = {
    async send(command: unknown) {
      if (command instanceof TransactWriteItemsCommand) {
        captured = command;
        return {};
      }
      if (command instanceof GetItemCommand) return {};
      throw new Error("Unexpected command");
    },
  } as unknown as DynamoDBClient;

  const repository = new DynamoBookingRepository("bookings-table", client);
  const result = await repository.create(storedBooking());
  assert.equal(result.kind, "created");
  assert.ok(captured);
  const writes = captured.input.TransactItems ?? [];
  assert.equal(writes.length, 3);
  assert.deepEqual(
    writes.map((write) => write.Put?.ConditionExpression),
    ["attribute_not_exists(pk)", "attribute_not_exists(pk)", "attribute_not_exists(pk)"],
  );
  assert.deepEqual(
    writes.map((write) => write.Put?.Item?.pk?.S?.split("#")[0]),
    ["SLOT", "IDEMPOTENCY", "BOOKING"],
  );
});

function itemForReplay(): Record<string, AttributeValue> {
  const booking = storedBooking();
  return Object.fromEntries(Object.entries({
    bookingId: booking.bookingId,
    slotId: booking.slotId,
    startAt: booking.startAt,
    endAt: booking.endAt,
    timezone: booking.timezone,
    idempotencyKey: booking.idempotencyKey,
    payloadHash: booking.payloadHash,
    encryptedName: booking.encryptedName,
    encryptedEmail: booking.encryptedEmail,
    emailHash: booking.emailHash,
    createdAt: booking.createdAt,
  }).map(([name, value]) => [name, { S: value }])) as Record<string, AttributeValue>;
}

test("DynamoDB maps conditional cancellation to replay, key misuse, or slot conflict", async () => {
  async function outcome(options: { idempotencyItem?: Record<string, AttributeValue>; slotExists?: boolean }) {
    const client = {
      async send(command: unknown) {
        if (command instanceof TransactWriteItemsCommand) {
          throw new TransactionCanceledException({ message: "conditional check failed", $metadata: {} });
        }
        if (command instanceof GetItemCommand) {
          const key = command.input.Key?.pk?.S;
          if (key?.startsWith("IDEMPOTENCY#")) return { Item: options.idempotencyItem };
          if (key?.startsWith("SLOT#") && options.slotExists) return { Item: { pk: { S: key } } };
          return {};
        }
        throw new Error("Unexpected command");
      },
    } as unknown as DynamoDBClient;
    return new DynamoBookingRepository("bookings-table", client).create(storedBooking());
  }

  const replay = await outcome({ idempotencyItem: itemForReplay() });
  assert.equal(replay.kind, "replay");
  if (replay.kind === "replay") assert.equal(replay.booking.bookingId, "booking-1");

  const mismatched = itemForReplay();
  mismatched.payloadHash = { S: "another-payload" };
  assert.equal((await outcome({ idempotencyItem: mismatched })).kind, "idempotency_conflict");
  assert.equal((await outcome({ slotExists: true })).kind, "slot_conflict");
});
