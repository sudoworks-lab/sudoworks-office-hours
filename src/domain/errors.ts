export type ErrorCode =
  | "INVALID_INPUT"
  | "INVALID_SLOT"
  | "SLOT_ALREADY_BOOKED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "RATE_LIMITED"
  | "ORIGIN_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Readonly<Record<string, string>> | undefined;
  readonly retryable: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    status: number;
    fields?: Readonly<Record<string, string>>;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
    this.retryable = options.retryable ?? false;
  }
}

export class ValidationError extends AppError {
  constructor(fields: Readonly<Record<string, string>>) {
    super({
      code: "INVALID_INPUT",
      message: "The booking details are invalid.",
      status: 400,
      fields,
    });
  }
}

export class InvalidSlotError extends AppError {
  constructor() {
    super({
      code: "INVALID_SLOT",
      message: "That Office Hours slot is no longer offered.",
      status: 400,
      fields: { slotId: "Choose one of the currently offered slots." },
    });
  }
}

export class SlotConflictError extends AppError {
  constructor() {
    super({
      code: "SLOT_ALREADY_BOOKED",
      message: "Someone else booked that slot first. Please choose another.",
      status: 409,
      retryable: true,
    });
  }
}

export class IdempotencyConflictError extends AppError {
  constructor() {
    super({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key was already used for different booking details.",
      status: 409,
    });
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(cause?: unknown) {
    super({
      code: "SERVICE_UNAVAILABLE",
      message: "Booking storage is temporarily unavailable. Please try again.",
      status: 503,
      retryable: true,
      cause,
    });
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    status: 500,
    cause: error,
  });
}
