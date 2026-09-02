# Office Hours system architecture

Status: implemented locally; AWS resources are defined for synthesis but
unapplied. See the latest receipt for the actual validation result.

## Shared request path

```text
Browser
  │  GET slots / POST booking + Idempotency-Key
  ▼
HTTP boundary ── body/origin/media/rate checks ── structured response + log
  │
  ▼
BookingService ── validation ── offered-slot check ── AES-GCM protection
  │
  ├── local: SQLite transaction + UNIQUE(slot_id, idempotency_key)
  │
  └── AWS: DynamoDB transaction
           ├── SLOT#<slot>             condition: pk absent
           ├── IDEMPOTENCY#<key>       condition: pk absent
           └── BOOKING#<id>            condition: pk absent
```

The database is the concurrency arbiter. Availability reads are advisory; the
write condition decides the winner. The service never treats an earlier
`available: true` result as a reservation.

## Local runtime

The dependency-light Node HTTP server serves `dist/public`, routes `/api/*` to
the shared HTTP boundary, and persists to a WAL-mode SQLite file. `BEGIN
IMMEDIATE` serializes writers before checking the two uniqueness invariants.
Restarting the process preserves bookings but resets runtime counters and the
in-memory per-address rate limiter.

## AWS-shaped runtime

CloudFront serves versioned S3 content and forwards `/api/*` uncached to a
regional API Gateway REST API. Lambda obtains key material from Secrets Manager,
uses the shared booking service, and writes the DynamoDB transaction. DynamoDB
uses on-demand billing, AWS-managed encryption, point-in-time recovery,
deletion protection, retained removal policy, and a 90-day TTL. Lambda and API
Gateway emit logs/metrics; X-Ray tracing and three CloudWatch alarms are
configured.

The stack intentionally has no domain name, notification destination, WAF, or
deployment pipeline. Alarm notification wiring and environment-specific
budgets belong in a deployment change, not in an unapplied reference stack.

## Error contract

Errors use `{ error: { code, message, fields?, retryable, requestId } }`.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT`, `INVALID_SLOT` | Malformed fields or a slot outside the current catalogue |
| 403 | `ORIGIN_NOT_ALLOWED` | Browser cross-site write rejected |
| 409 | `SLOT_ALREADY_BOOKED` | Another request owns the slot |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key, different canonical payload |
| 413/415 | `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` | HTTP boundary rejected the request |
| 429 | `RATE_LIMITED` | The application-level warm-process limiter rejected the request |
| 503 | `SERVICE_UNAVAILABLE` | Persistence readiness/write failed |
| 500 | `INTERNAL_ERROR` | Unclassified error; details remain server-side |

CloudFront or API Gateway can reject a request before Lambda runs, including an
API Gateway stage throttle. Those provider-generated responses use their native
envelopes and are not evidence of the application error contract above.

## Privacy and trust boundaries

Only name, email, slot, timezone, consent, and the idempotency header enter the
write path. Names and emails are encrypted with randomized AES-256-GCM nonces.
Email and canonical payload equality use keyed HMAC-SHA-256 values. Logs contain
request metadata and stable error classes but not request bodies or contact
fields. The UI uses no local/session storage.

Local automated retention/deletion is not implemented. DynamoDB TTL provides
eventual expiration after 90 days, but an explicit subject-deletion workflow
and encryption-key rotation are known gaps.
