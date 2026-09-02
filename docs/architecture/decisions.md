# Architecture decisions

## ADR-001: dependency-light Node service

**Decision:** Use Node.js 22 standard modules for the HTTP server, static UI,
cryptography, tests, and build. Use the built-in SQLite binding for persistence.

**Why:** The product remains directly runnable and auditable from an empty
repository without hiding essential behavior behind a framework. SQLite gives
transactional uniqueness for the single-instance booking scope.

**Trade-off:** `node:sqlite` is experimental in Node 22 and emits a warning.
This is acceptable for this portfolio iteration, but must be revisited before a
runtime upgrade or multi-instance deployment.

## ADR-002: single-owner slot transaction

**Decision:** A transaction inserts a booking against a unique `slot_id`.
Idempotency keys are unique and tied to a canonical payload hash.

**Why:** The database, rather than an in-memory pre-check, arbitrates concurrent
requests. This makes duplicate protection testable.

**Trade-off:** Local SQLite is deliberately a single-instance design. Horizontal
scale requires migration to a shared transactional store and is not claimed.

## ADR-003: encrypted contact data, no outbound integration

**Decision:** Encrypt name and email with AES-256-GCM before persistence. Keep a
keyed email digest only for equality checks. Require an explicit base64 key in
`NODE_ENV=production`; use a documented development key locally.

**Why:** The slice proves a privacy boundary without pretending an email or
calendar integration exists.

**Trade-off:** Key rotation and automated deletion are not implemented. They
remain named operational gaps.

## ADR-004: no Kubernetes in this repository

**Decision:** Package one container and describe the AWS-shaped serverless path
in AWS CDK.

**Why:** Kubernetes would not solve a current product constraint. CDK expresses
the accepted API Gateway, Lambda, DynamoDB, S3, and CloudFront path without
adding a second infrastructure language. The important evidence is
transactional behavior, observability, secure defaults, CI, and honest
deployability.

## ADR-005: no unverified project catalogue

**Decision:** Selected Projects initially contains only this repository as a
verified project. The career narrative is labelled as supplied context, not
repository proof.

**Why:** The source repository is empty and no external project evidence was
provided. An incomplete but truthful portfolio is preferable to invented work.

## ADR-006: one domain, two persistence adapters

**Decision:** Keep validation, slot generation, contact protection, error
semantics, and booking orchestration in a shared TypeScript domain. Implement a
SQLite repository for the local executable and a DynamoDB repository for
Lambda.

**Why:** The local app remains useful without an AWS account while the cloud
path exercises identical booking rules. Adapter contract tests and CDK
assertions can evolve independently of the UI.

**Trade-off:** Local SQLite and cloud DynamoDB do not share data. This is not a
transparent migration mechanism.

## ADR-007: transactional conditional writes on DynamoDB

**Decision:** Claim a slot, idempotency key, and booking identity in one
`TransactWriteItems` call. Every put uses `attribute_not_exists(pk)`. After a
cancelled transaction, strongly consistent point reads distinguish replay,
idempotency misuse, and slot conflict.

**Why:** A conditional write on only the booking row cannot atomically protect
both slot ownership and request replay. The three-item transaction preserves
both invariants during concurrency.

**Trade-off:** Contact ciphertext is duplicated in the idempotency record so an
idempotent replay does not need a second read. Deletion must remove all related
records; the current 90-day DynamoDB TTL is eventual, not immediate.
