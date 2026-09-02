# SudoWorks Office Hours

A small, inspectable platform-engineering portfolio with an executable Office Hours
booking flow. The local application persists bookings in SQLite. The unapplied
AWS path reuses the same TypeScript domain behind API Gateway and Lambda, with
DynamoDB transactional conditional writes as the slot-ownership boundary.

## Public identity boundary

The public surface uses **SudoWorks** and is product/system-first. It intentionally
publishes no legal name or initials, age, location, phone number, personal email
address, employer profile, family detail, portrait, or personal social account.
Direct public-profile navigation is temporarily suppressed because the current
external profile display identity does not yet meet this anonymity boundary.
Project-specific links may be restored only after their destinations are verified
safe; no safe destination is invented by this candidate.

Office Hours stores a technical-conversation request. The current repository
proves request storage but does not implement an operator notification or
retrieval handoff, so it must not imply a guaranteed response, scheduled meeting,
confirmation message, or calendar invitation.

## Run locally

Requirements: Node.js `22.18–22.x` and npm 10.

```bash
npm ci --ignore-scripts
npm run build
npm start
```

Open <http://127.0.0.1:3000>. Local data is written to
`data/bookings.sqlite` and ignored by Git. Outside `NODE_ENV=production`, the
application derives a documented development-only encryption key. Production
startup intentionally fails unless `BOOKING_ENCRYPTION_KEY` is a base64-encoded
32-byte value.

Useful configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listener address |
| `PORT` | `3000` | Listener port |
| `BOOKING_DB_PATH` | `data/bookings.sqlite` | Local SQLite file |
| `STATIC_DIR` | `dist/public` when built | Static frontend root |
| `BOOKING_ENCRYPTION_KEY` | development-only derived key | Base64 32-byte encryption key; required in production |

## Verify

```bash
npm run check
npm test
npm run build
npm run infra:test
npm run infra:synth
npm run test:browser
```

`npm run verify` combines the core and browser paths. CI additionally builds
the container. CDK commands synthesize only; this repository contains no proof
that the stack has been deployed.

## Guarantees and boundaries

- One booking owns a slot. SQLite unique constraints enforce this locally;
  DynamoDB `TransactWriteItems` conditions enforce it on AWS.
- A repeated idempotency key with the same canonical payload returns the
  original booking. Reuse with another payload is a `409` error.
- Name and email are AES-256-GCM ciphertext at rest. Logs, metrics, responses,
  URLs, and browser persistence exclude them.
- The app has no email, calendar, CRM, analytics, or authentication integration.
- Runtime counters are process-local evidence, not historical business metrics.

Start with [the system architecture](docs/architecture/system.md),
[the reliability model](docs/architecture/reliability.md),
[SLIs/SLOs](docs/operations/sli-slo.md), [the runbook](docs/operations/runbook.md),
and [the evidence map](docs/evidence/implementation.md).
