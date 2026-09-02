import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { BookingService } from "../domain/booking-service.ts";
import { RollingSlotCatalogue } from "../domain/slots.ts";
import { OfficeHoursApi } from "../http/api.ts";
import { createContactProtector, keyFromSecret } from "../shared/contact-protector.ts";
import { JsonLogger } from "../shared/logger.ts";
import { systemClock, uuidGenerator } from "../shared/runtime.ts";
import { DynamoBookingRepository } from "./dynamo-booking-repository.ts";

interface ApiGatewayEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined> | null;
  body: string | null;
  isBase64Encoded?: boolean;
  requestContext: {
    requestId?: string;
    identity?: { sourceIp?: string };
  };
}

interface LambdaResponse {
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  isBase64Encoded: false;
}

const logger = new JsonLogger();
const secrets = new SecretsManagerClient({});
let apiPromise: Promise<OfficeHoursApi> | undefined;

async function createApi(): Promise<OfficeHoursApi> {
  const tableName = process.env.BOOKING_TABLE_NAME;
  const secretArn = process.env.BOOKING_KEY_SECRET_ARN;
  if (!tableName || !secretArn) throw new Error("Lambda storage configuration is incomplete.");

  const secretResult = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!secretResult.SecretString) throw new Error("Booking encryption secret has no string value.");
  const parsed = JSON.parse(secretResult.SecretString) as { key?: unknown };
  if (typeof parsed.key !== "string" || parsed.key.length < 32) {
    throw new Error("Booking encryption secret is malformed.");
  }

  const service = new BookingService(
    new DynamoBookingRepository(tableName),
    createContactProtector(keyFromSecret(parsed.key)),
    new RollingSlotCatalogue(),
    systemClock,
    uuidGenerator,
  );
  return new OfficeHoursApi({ service, logger, storageKind: "dynamodb", runtimeKind: "lambda" });
}

export async function handler(event: ApiGatewayEvent): Promise<LambdaResponse> {
  apiPromise ??= createApi().catch((error: unknown) => {
    apiPromise = undefined;
    throw error;
  });
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(event.headers ?? {})) headers[name.toLowerCase()] = value;
  const rawBody = event.body ?? "";
  const body = event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody;
  let response;
  try {
    response = await (await apiPromise).handle({
      method: event.httpMethod,
      path: event.path,
      headers,
      body,
      ...(event.requestContext.identity?.sourceIp ? { remoteAddress: event.requestContext.identity.sourceIp } : {}),
      ...(event.requestContext.requestId ? { requestId: event.requestContext.requestId } : {}),
    });
  } catch (error) {
    const requestId = event.requestContext.requestId ?? "unavailable";
    logger.log({
      event: "lambda_initialization_failed",
      level: "error",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    response = {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "The booking service could not initialize its dependencies.",
          retryable: true,
          requestId,
        },
      }),
    };
  }
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
    isBase64Encoded: false,
  };
}
