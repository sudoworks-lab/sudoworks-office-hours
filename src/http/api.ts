import { randomUUID } from "node:crypto";
import { BookingService } from "../domain/booking-service.ts";
import { AppError, toAppError } from "../domain/errors.ts";
import type { Logger } from "../shared/logger.ts";
import { RuntimeMetrics } from "../shared/metrics.ts";

const MAX_BODY_BYTES = 16 * 1_024;

export interface ApiRequest {
  method: string;
  path: string;
  headers: Readonly<Record<string, string | undefined>>;
  body?: string;
  remoteAddress?: string;
  requestId?: string;
}

export interface ApiResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}

interface RateLimitState {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly clients = new Map<string, RateLimitState>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(
    limit = 10,
    windowMs = 60_000,
    now: () => number = Date.now,
  ) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const currentTime = this.now();
    const current = this.clients.get(key);
    if (!current || current.resetAt <= currentTime) {
      this.clients.set(key, { count: 1, resetAt: currentTime + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    return {
      allowed: current.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - currentTime) / 1_000)),
    };
  }
}

export interface ApiOptions {
  service: BookingService;
  logger: Logger;
  metrics?: RuntimeMetrics;
  rateLimiter?: FixedWindowRateLimiter;
  storageKind: "sqlite" | "dynamodb";
  runtimeKind: "local" | "lambda";
}

function json(status: number, value: unknown, requestId: string, extraHeaders = {}): ApiResponse {
  return {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
      ...extraHeaders,
    },
    body: JSON.stringify(value),
  };
}

function header(request: ApiRequest, name: string): string | undefined {
  return request.headers[name] ?? request.headers[name.toLowerCase()];
}

function enforceSameOrigin(request: ApiRequest): void {
  const fetchSite = header(request, "sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    throw new AppError({
      code: "ORIGIN_NOT_ALLOWED",
      message: "Cross-site booking requests are not allowed.",
      status: 403,
    });
  }

  const origin = header(request, "origin");
  const host = header(request, "host") ?? header(request, "x-forwarded-host");
  if (!origin || !host || fetchSite === "same-origin" || fetchSite === "same-site") return;

  try {
    if (new URL(origin).host !== host) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw new AppError({
      code: "ORIGIN_NOT_ALLOWED",
      message: "Cross-origin booking requests are not allowed.",
      status: 403,
    });
  }
}

export class OfficeHoursApi {
  private readonly metrics: RuntimeMetrics;
  private readonly rateLimiter: FixedWindowRateLimiter;
  private readonly options: ApiOptions;

  constructor(options: ApiOptions) {
    this.options = options;
    this.metrics = options.metrics ?? new RuntimeMetrics();
    this.rateLimiter = options.rateLimiter ?? new FixedWindowRateLimiter();
  }

  async handle(request: ApiRequest): Promise<ApiResponse> {
    const started = performance.now();
    const requestId = request.requestId ?? randomUUID();
    this.metrics.increment("requests");
    let response: ApiResponse;
    let errorCode: string | undefined;

    try {
      response = await this.route(request, requestId);
    } catch (error) {
      const appError = toAppError(error);
      errorCode = appError.code;
      if (appError.code === "INVALID_INPUT" || appError.code === "INVALID_SLOT") {
        this.metrics.increment("validationErrors");
      } else if (appError.status === 409) {
        this.metrics.increment("conflicts");
      } else if (appError.status === 503) {
        this.metrics.increment("dependencyErrors");
      } else if (appError.status >= 500) {
        this.metrics.increment("unexpectedErrors");
      }

      response = json(appError.status, {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.fields ? { fields: appError.fields } : {}),
          retryable: appError.retryable,
          requestId,
        },
      }, requestId);
    }

    this.options.logger.log({
      event: "http_request_completed",
      level: response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
      requestId,
      method: request.method,
      route: request.path,
      status: response.status,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      ...(errorCode ? { errorCode } : {}),
    });
    return response;
  }

  private async route(request: ApiRequest, requestId: string): Promise<ApiResponse> {
    const method = request.method.toUpperCase();

    if (request.path === "/api/health/live") {
      if (method !== "GET") throw this.methodNotAllowed();
      return json(200, { status: "live", service: "office-hours" }, requestId);
    }

    if (request.path === "/api/health/ready") {
      if (method !== "GET") throw this.methodNotAllowed();
      await this.options.service.ready();
      return json(200, { status: "ready", storage: this.options.storageKind }, requestId);
    }

    if (request.path === "/api/slots") {
      if (method !== "GET") throw this.methodNotAllowed();
      const slots = await this.options.service.listSlots();
      return json(200, { slots }, requestId);
    }

    if (request.path === "/api/engineering") {
      if (method !== "GET") throw this.methodNotAllowed();
      let readiness: "ready" | "degraded" = "ready";
      try {
        await this.options.service.ready();
      } catch {
        readiness = "degraded";
      }
      return json(200, {
        service: "office-hours",
        version: "0.3.0",
        runtime: this.options.runtimeKind,
        persistence: this.options.storageKind,
        readiness,
        counters: this.metrics.snapshot(),
        guarantees: [
          "unique slot ownership",
          "idempotent same-payload replay",
          "encrypted contact fields at rest",
        ],
        evidenceScope: "Counters are process-local and reset on restart.",
      }, requestId);
    }

    if (request.path === "/api/bookings") {
      if (method !== "POST") throw this.methodNotAllowed();
      enforceSameOrigin(request);

      const rateLimit = this.rateLimiter.consume(request.remoteAddress ?? "unknown");
      if (!rateLimit.allowed) {
        throw new AppError({
          code: "RATE_LIMITED",
          message: "Too many booking attempts. Please wait and try again.",
          status: 429,
          retryable: true,
        });
      }

      const contentType = header(request, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType !== "application/json") {
        throw new AppError({
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Use Content-Type: application/json.",
          status: 415,
        });
      }

      const body = request.body ?? "";
      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        throw new AppError({
          code: "PAYLOAD_TOO_LARGE",
          message: "The request body exceeds 16 KiB.",
          status: 413,
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new AppError({
          code: "INVALID_INPUT",
          message: "The request body is not valid JSON.",
          status: 400,
          fields: { body: "Send a valid JSON object." },
        });
      }

      const outcome = await this.options.service.book(parsed, header(request, "idempotency-key"));
      this.metrics.increment(outcome.replayed ? "bookingsReplayed" : "bookingsCreated");
      return json(outcome.replayed ? 200 : 201, outcome, requestId);
    }

    throw new AppError({ code: "NOT_FOUND", message: "Route not found.", status: 404 });
  }

  private methodNotAllowed(): AppError {
    return new AppError({
      code: "METHOD_NOT_ALLOWED",
      message: "That method is not allowed for this route.",
      status: 405,
    });
  }
}
