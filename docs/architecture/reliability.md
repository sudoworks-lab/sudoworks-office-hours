# Reliability model and failure scenarios

## Invariants

1. At most one accepted booking owns a slot.
2. One idempotency key identifies one canonical payload.
3. A same-key, same-payload retry returns the original public confirmation.
4. Contact plaintext never crosses the persistence boundary or structured-log
   boundary.
5. Availability is advisory; only the atomic write grants ownership.

SQLite enforces the first two invariants using a write transaction and unique
indexes. DynamoDB enforces them using one three-item conditional transaction.
The domain maps adapter outcomes to the same HTTP semantics.

## Failure scenarios

| Failure | System response | Recovery / evidence |
| --- | --- | --- |
| Two visitors submit one slot | one `201`; remaining requests receive `409 SLOT_ALREADY_BOOKED` | concurrent and live-service tests |
| Client loses success response and retries | `200`, original booking ID, `replayed: true` | domain, HTTP, SQLite, Dynamo mapping tests |
| Key is reused for changed details | `409 IDEMPOTENCY_KEY_REUSED` | domain and Dynamo mapping tests |
| Malformed/oversized/cross-site request | bounded `4xx` with stable error code | HTTP boundary tests |
| SQLite/DynamoDB unavailable | readiness/write returns `503 SERVICE_UNAVAILABLE` | injected repository tests; runbook triage |
| Secrets Manager/init unavailable | Lambda returns safe `503`; no secret/error details | handler implementation and typecheck; not executed in AWS |
| Aborted/malformed local HTTP request | outer request boundary logs type/request ID and contains failure | local server implementation |
| Process restart | bookings persist; runtime counters and limiter reset | SQLite restart and live restart checks |
| Lambda cold start / multiple instances | domain guarantees persist in DynamoDB; UI counters remain instance-local | architecture inspection; not a global metric |

## Deliberate limits

The local runtime is single-host, AWS is single-region, and neither path has a
calendar/email integration. There is no disaster-recovery exercise, load test,
key rotation, immediate retention deletion, alarm delivery test, or deployed
availability history. Those gaps are explicit so the evidence is not mistaken
for an achieved production service level.
