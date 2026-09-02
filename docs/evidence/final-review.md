# Final three-lens review

Date: 2026-08-30

## Evidence chronology

### HISTORICAL ENVIRONMENT BLOCKER — 2026-08-30

At this review's timestamp, Playwright Chromium was unavailable, the workspace
policy denied CDK's installed internal `token.js`, and Docker/Podman was absent.
The historical failures remain recorded under Historical open findings below;
none was treated as a pass at the time.

### CURRENT REVALIDATION RESULT — 2026-09-01

- **Browser PASS:** the post-UTC `npm run test:browser` run passed desktop and
  mobile viewports plus validation, conflict, and success states. It reported
  zero unexpected console errors, page errors, or failed requests. The two
  Chromium HTTP console diagnostics were the expected `400` and `409` negative
  paths and are asserted explicitly. Fresh screenshots use UTC and were
  inspected for layout and privacy regressions.
- **Docker PASS:** Docker `29.6.2` built
  `sudoworks-office-hours:publication-candidate`; a fresh container reached
  liveness, readiness, and Docker `healthy` while running as UID/GID 1000.
- **Credential-free CDK synth PASS:** with AWS credential/profile variables
  removed and EC2 metadata disabled, `npm run verify:core` passed CDK assertions
  and `infra:synth`, produced `dist/cdk.out/SudoWorksOfficeHours.template.json`,
  and reported that no deployment was performed. The synthesized template
  contains S3, CloudFront, API Gateway, Lambda, DynamoDB, and Secrets Manager
  resources.
- **Still not evidenced:** AWS deployment and a live GitHub Actions run.

This continuation note is evidence maintenance, not a new independent review.
The canonical current command record is in
`docs/receipts/publication-candidate.md`.

Historical scope: repository implementation, passing domain/local tests, built
artifacts, and direct live-service behavior. AWS deployment was out of scope.
Browser and CDK runtime limitations of that execution environment were recorded
rather than silently treated as passes.

## Hiring Manager lens

The first-screen proposition identifies platform/reliability work, the repeated
problem (person-dependent operations), what can be used (the booking slice),
and where evidence stops. The project is identified as personal and
repository-verifiable; no employer, scale, customer, or outcome is invented.
The sole verified project is narrow but is carried through product, runtime,
tests, infrastructure, and operations.

Finding fixed (High): implementation paths were initially presented without a
complete Claim → Evidence → Validation → Limitation mapping. The evidence map
now includes all four dimensions and distinguishes local proof from unapplied
AWS intent.

## Senior SRE / Platform Engineer lens

The primary slot invariant is enforced at persistence, not by advisory reads.
Liveness/readiness are separate, errors are stable, logs exclude PII, runtime
counters are explicitly non-historical, and the runbook/SLOs do not claim
observed service levels.

High findings fixed:

- Replaced broad DynamoDB read/write grants with only `BatchGetItem`, `GetItem`,
  and `TransactWriteItems` on the booking table.
- Contained asynchronous request-body/URL failures outside the local API router
  so malformed or aborted requests do not become unhandled rejections.
- Enforced mode `0600` on the SQLite database.
- Added a repository-owned programmatic CDK synth command instead of depending
  on an undeclared global CDK CLI.
- Added explicit DynamoDB conditional-cancellation tests for replay,
  idempotency misuse, and occupied-slot outcomes.

## Adversarial reliability lens

The review exercised invalid input, same-payload replay, different-request slot
contention, multi-connection persistence, dependency failure mapping, contact
ciphertext randomness, log redaction, and a live eight-request race. One write
won and seven received explicit conflicts; a subsequent same-key retry returned
the original ID. A restart preserved the occupied slot and reset counters.

High findings fixed:

- Validation checked control characters after whitespace normalization, which
  could erase the evidence; it now checks the raw submitted name.
- Browser JavaScript was copied without parsing during build; it is now bundled
  by esbuild and therefore syntax-checked.
- Form errors were visible but not consistently associated with controls; the
  UI now uses `aria-describedby` and `aria-invalid`, with focusable alert and
  success states.

## Historical open findings — 2026-08-30

At the original review timestamp, no known Critical or High implementation
finding remained in the validated local path. The following were then-current
verification/operational gaps, not passes. See Current revalidation result above
for the later browser, CDK, and Docker outcomes.

- Playwright Chromium was absent. Both ordinary and approved download attempts
  failed DNS resolution, so the executable browser test and screenshots could
  not run in this environment.
- That sandbox denied every workspace filename containing `token`, including
  CDK's installed internal `aws-cdk-lib/core/lib/token.js`. CDK assertions and
  synthesis therefore fail before repository code executes. An exact `/tmp`
  validation copy could not install its locked dependencies because ordinary
  and approved registry requests also failed DNS resolution.
- Docker/Podman was not installed, so the container image was not built locally.
- AWS, GitHub Actions, alarms, restore, TTL deletion, load, and disaster recovery
  had not been exercised.
- Local SQLite remains a single-host design on Node's experimental SQLite API;
  automated local retention and encryption-key rotation are not implemented.
