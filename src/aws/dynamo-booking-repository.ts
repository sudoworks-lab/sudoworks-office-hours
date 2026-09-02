import {
  BatchGetItemCommand,
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import type {
  BookingRepository,
  CreateBookingResult,
  StoredBooking,
} from "../domain/model.ts";

type Item = Record<string, AttributeValue>;

function stringValue(value: string): AttributeValue {
  return { S: value };
}

function numberValue(value: number): AttributeValue {
  return { N: String(value) };
}

function readString(item: Item, name: string): string {
  const value = item[name];
  if (!value || !("S" in value) || typeof value.S !== "string") {
    throw new Error(`DynamoDB item is missing string attribute ${name}.`);
  }
  return value.S;
}

function bookingFromItem(item: Item): StoredBooking {
  return {
    bookingId: readString(item, "bookingId"),
    slotId: readString(item, "slotId"),
    startAt: readString(item, "startAt"),
    endAt: readString(item, "endAt"),
    timezone: readString(item, "timezone"),
    idempotencyKey: readString(item, "idempotencyKey"),
    payloadHash: readString(item, "payloadHash"),
    encryptedName: readString(item, "encryptedName"),
    encryptedEmail: readString(item, "encryptedEmail"),
    emailHash: readString(item, "emailHash"),
    createdAt: readString(item, "createdAt"),
  };
}

function retentionEpoch(createdAt: string): number {
  return Math.floor(new Date(createdAt).getTime() / 1_000) + 90 * 24 * 60 * 60;
}

export class DynamoBookingRepository implements BookingRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBClient;

  constructor(
    tableName: string,
    client = new DynamoDBClient({}),
  ) {
    this.tableName = tableName;
    this.client = client;
  }

  async create(booking: StoredBooking): Promise<CreateBookingResult> {
    const expiresAtEpoch = retentionEpoch(booking.createdAt);
    const commonBookingAttributes: Item = {
      bookingId: stringValue(booking.bookingId),
      slotId: stringValue(booking.slotId),
      startAt: stringValue(booking.startAt),
      endAt: stringValue(booking.endAt),
      timezone: stringValue(booking.timezone),
      idempotencyKey: stringValue(booking.idempotencyKey),
      payloadHash: stringValue(booking.payloadHash),
      encryptedName: stringValue(booking.encryptedName),
      encryptedEmail: stringValue(booking.encryptedEmail),
      emailHash: stringValue(booking.emailHash),
      createdAt: stringValue(booking.createdAt),
      expiresAtEpoch: numberValue(expiresAtEpoch),
    };

    try {
      await this.client.send(new TransactWriteItemsCommand({
        ClientRequestToken: booking.bookingId,
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: {
                pk: stringValue(`SLOT#${booking.slotId}`),
                entity: stringValue("slot-lock"),
                bookingId: stringValue(booking.bookingId),
                idempotencyKey: stringValue(booking.idempotencyKey),
                payloadHash: stringValue(booking.payloadHash),
                expiresAtEpoch: numberValue(expiresAtEpoch),
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: {
                pk: stringValue(`IDEMPOTENCY#${booking.idempotencyKey}`),
                entity: stringValue("idempotency-record"),
                ...commonBookingAttributes,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: {
                pk: stringValue(`BOOKING#${booking.bookingId}`),
                entity: stringValue("booking"),
                ...commonBookingAttributes,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
        ],
      }));
      return { kind: "created", booking };
    } catch (error) {
      if (!(error instanceof TransactionCanceledException) && !(error instanceof Error && error.name === "TransactionCanceledException")) {
        throw error;
      }

      const idempotencyRecord = await this.get(`IDEMPOTENCY#${booking.idempotencyKey}`);
      if (idempotencyRecord) {
        if (readString(idempotencyRecord, "payloadHash") === booking.payloadHash) {
          return { kind: "replay", booking: bookingFromItem(idempotencyRecord) };
        }
        return { kind: "idempotency_conflict" };
      }

      const slotLock = await this.get(`SLOT#${booking.slotId}`);
      if (slotLock) return { kind: "slot_conflict" };
      throw error;
    }
  }

  async listBookedSlotIds(slotIds: readonly string[]): Promise<ReadonlySet<string>> {
    const booked = new Set<string>();
    for (let offset = 0; offset < slotIds.length; offset += 100) {
      let keys: Item[] = slotIds.slice(offset, offset + 100).map((id) => ({ pk: stringValue(`SLOT#${id}`) }));
      for (let attempt = 0; keys.length > 0 && attempt < 3; attempt += 1) {
        const result = await this.client.send(new BatchGetItemCommand({
          RequestItems: {
            [this.tableName]: { Keys: keys, ConsistentRead: true, ProjectionExpression: "pk" },
          },
        }));
        for (const item of result.Responses?.[this.tableName] ?? []) {
          const key = readString(item, "pk");
          if (key.startsWith("SLOT#")) booked.add(key.slice(5));
        }
        keys = result.UnprocessedKeys?.[this.tableName]?.Keys ?? [];
      }
      if (keys.length > 0) throw new Error("DynamoDB did not process all slot availability reads.");
    }
    return booked;
  }

  async healthcheck(): Promise<void> {
    await this.get("HEALTHCHECK");
  }

  private async get(pk: string): Promise<Item | undefined> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: { pk: stringValue(pk) },
      ConsistentRead: true,
    }));
    return result.Item;
  }
}
