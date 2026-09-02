# Office Hours operator runbook

## Scope and safety

This runbook covers the implemented local service and the CDK-defined AWS
design. No AWS deployment is authorized or evidenced by this repository. Never
log, paste, or commit a booking encryption key, request body, name, or email.

## Local start and checks

```bash
npm ci --ignore-scripts
npm run build
npm start
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
```

Expected liveness is `200 {"status":"live"...}`. Readiness additionally opens
and queries SQLite. Production/container startup requires a base64-encoded
32-byte `BOOKING_ENCRYPTION_KEY` supplied by the runtime; do not put it in an
environment file in this repository.

## Triage

1. Capture the response `x-request-id`, status, and stable error code. Do not
   capture the submitted form payload.
2. Check liveness. If it fails, inspect process exit and `server_start_failed`
   structured logs.
3. Check readiness. A live-but-not-ready process points to the SQLite path,
   permissions, disk, or (on AWS) DynamoDB/Secrets Manager access.
4. Check disk space and that the configured SQLite parent directory is writable.
   SQLite may have `-wal` and `-shm` companions while running; they are expected.
5. For conflicts, distinguish normal `SLOT_ALREADY_BOOKED` user contention from
   `IDEMPOTENCY_KEY_REUSED`, which indicates caller key misuse.

## Failure responses

### SQLite unavailable or locked

- Stop admitting traffic if readiness fails repeatedly.
- Confirm there is only one intended service owner of the database file.
- Preserve the database plus WAL/SHM companions before forensic work.
- Do not delete lock/WAL files from a running process.
- Restart only after the underlying filesystem/permission condition is fixed,
  then verify readiness and make one non-sensitive test booking.

### Elevated 409 conflicts

- Check whether a small number of slots are being contended normally.
- Correlate only request IDs and slot IDs; contact data must not enter logs.
- If accepted duplicate owners are suspected, stop writes and preserve the data.
  This violates the primary invariant and is a severity-1 defect.

### AWS 5xx or readiness failure

- Use API Gateway request ID to correlate Lambda structured logs and X-Ray.
- Check Lambda errors/throttles, DynamoDB throttling/system errors, Secrets
  Manager access, and KMS/service health.
- A `TransactionCanceledException` followed by a found slot/idempotency record
  is a handled 200/409 outcome, not a dependency incident.
- Roll back the Lambda version/infrastructure change that introduced the failure;
  retained DynamoDB data must not be replaced or deleted during rollback.

## Backup, retention, and deletion

For local backup, stop the service cleanly and copy the SQLite database and any
remaining WAL/SHM companions together to approved encrypted storage. Restore is
verified by starting against a copy and checking readiness plus booked-slot
visibility.

DynamoDB PITR and 90-day TTL are configured but unverified until deployment.
TTL deletion is eventual. Local automatic retention and a subject-access or
deletion command are not implemented; route such requests to a human operator
and record that limitation rather than modifying data ad hoc.

## Verification after change

Run `npm run verify:core`, `npm run test:browser`, inspect the generated
`dist/cdk.out`, and perform the manual checks in the latest receipt. A synth is
not a deploy.
