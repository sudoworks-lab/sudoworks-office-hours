# Overnight implementation receipt — latest

Date: 2026-08-30

## Evidence chronology

### HISTORICAL ENVIRONMENT BLOCKER — 2026-08-30

The original receipt correctly recorded browser, CDK, and Docker as blocked in
that environment. The detailed failures remain below under Historical
environment-blocked validation and are not rewritten as passes.

### CURRENT REVALIDATION RESULT — 2026-09-01

- **Browser PASS:** the post-UTC `npm run test:browser` run passed at
  `1440x1000` and `390x844`, including validation, conflict, success, semantic
  landmarks, keyboard focus, and horizontal-overflow checks. Unexpected console
  errors, page errors, and failed requests were zero; two expected Chromium
  diagnostics mapped exactly to the exercised `400`/`409` responses. Fresh
  screenshots expose UTC rather than the host timezone.
- **Docker PASS:** Docker `29.6.2` built the publication-candidate image. A
  fresh non-root container returned live/ready and reached Docker `healthy`.
- **Credential-free CDK synth PASS:** `npm run verify:core`, executed with AWS
  credential/profile variables removed and metadata access disabled, passed
  15/15 application tests, 1/1 CDK assertion test, and `infra:synth`. The cloud
  assembly and synthesized template exist and contain the expected core
  resources. The command explicitly reported that no deployment was performed.
- **Unchanged boundary:** no AWS deployment and no live GitHub Actions run are
  evidenced.

The canonical current command/result record is
`docs/receipts/publication-candidate.md`.

## HISTORICAL STATUS — 2026-08-30

At this receipt's timestamp, implementation was complete for the requested local
product, shared booking domain, SQLite adapter, AWS-shaped adapter, CDK stack,
tests, CI, observability, and operating evidence. The local core was validated.
Status was **partially validated** because that environment blocked CDK's installed internal
`token.js` filename and had no browser binary; neither item was reported as a
pass. Nothing was deployed, committed, or pushed.

## IMPLEMENTED

- Responsive Home, engineer/value proposition, truthful selected-project
  presentation, live Engineering View, slot picker, booking form, validation and
  conflict alerts, success state, keyboard focus treatment, reduced-motion
  support, and mobile breakpoints.
- Shared TypeScript booking domain with bounded/explicit validation, rolling
  offered slots, stable error codes, idempotent same-payload replay, different-
  payload key rejection, and database-arbitrated slot ownership.
- Local WAL-mode SQLite persistence with write transactions, unique slot and
  idempotency constraints, restart persistence, AES-256-GCM contact encryption,
  keyed equality hashes, and database mode `0600`.
- Local HTTP server with body/media/origin/rate boundaries, liveness/readiness,
  security headers, structured privacy-safe logs, process-local counters, and
  containment for failures outside the API router.
- AWS Lambda adapter with safe initialization failures and the shared API/domain;
  DynamoDB adapter with one three-item `TransactWriteItems` conditional claim for
  slot, idempotency key, and booking.
- AWS CDK definitions for CloudFront/S3 static hosting, API Gateway, Lambda,
  DynamoDB, Secrets Manager, access/application logs, X-Ray, alarms, retention,
  deletion protection, and IAM limited to the used DynamoDB actions and table.
- Self-contained programmatic CDK synthesis entry at `scripts/synth.ts`; no
  undeclared global CDK CLI dependency.
- GitHub Actions CI, multi-stage Dockerfile, build/lint scripts, 15 local tests,
  CDK assertion test, and Playwright happy/invalid/conflict/mobile/accessibility
  flow.
- Architecture, reliability/failure model, privacy boundary, SLI/SLO proposal,
  runbook, Claim → Evidence → Validation → Limitation map, and final three-lens
  review.

## VALIDATION PASSED

- `npm install --package-lock-only --ignore-scripts --offline`: lock metadata
  updated; npm reported 109 packages audited and 0 vulnerabilities.
- `npm run check`: dependency tree valid, TypeScript typecheck passed, repository
  lint passed.
- `npm test`: 15/15 passed. Coverage includes successful booking, invalid input,
  replay, key misuse, concurrent conflict, SQLite restart/two-connection
  behavior, mode `0600`, dependency failure mapping, HTTP boundaries, DynamoDB
  transactional commands/cancellation mappings, randomized ciphertext, log
  redaction, and frontend contract/accessibility structure.
- `npm run build`: passed; produced bundled local server, Lambda, parsed/bundled
  browser JavaScript, and static assets.
- Built live service smoke check on `127.0.0.1`: Home and bundled JS returned
  `200` with CSP; invalid booking returned `400 INVALID_INPUT`; booking returned
  `201`; same-key replay returned `200` with the same booking ID; competing key
  returned `409 SLOT_ALREADY_BOOKED`; SQLite mode observed as `600`.
- Live eight-request contention check: exactly one `201` and seven `409`
  responses. Engineering View then reported actual request/creation/conflict
  counters and ready persistence.
- Live restart check: the booked slot remained unavailable after restart while
  process-local counters reset to zero.
- Structured logs observed for live requests contained request ID, route,
  status, duration, and error code, with no submitted name or email.
- Targeted source verification confirmed all five final High fixes: scoped IAM,
  outer request failure containment, SQLite chmod, associated form errors, and
  repository-owned `app.synth()` path.

## HISTORICAL ENVIRONMENT BLOCKER — detailed 2026-08-30 record

- `npm run infra:test` and `npm run infra:synth` both stopped before repository CDK
  code executes with:
  `EACCES: permission denied, open '.../node_modules/aws-cdk-lib/core/lib/token.js'`.
  The Hermes workspace policy denies filenames containing `token`; requesting
  access to that policy-denied path is not permitted.
- An exact source copy under `/tmp` could not obtain its locked dependencies:
  offline install lacked one cached package, and both ordinary and approved npm
  installs failed `EAI_AGAIN registry.npmjs.org`. No further bypass was attempted.
- `npm run test:browser` could not launch because Playwright Chromium was absent.
  Ordinary and approved installs both failed `EAI_AGAIN cdn.playwright.dev`, and
  no Chromium, Chrome, Firefox, or bundled browser executable existed locally.
  The browser test did **not** pass and no screenshot/visual claim is made.
- Docker and Podman were absent, so the image was not built locally. The Docker
  build remained an executable CI step but was not local validation evidence.
- GitHub Actions and AWS were not invoked. The stack is not deployed.

## Historical known limitations — 2026-08-30

- Local SQLite is intentionally single-host and uses Node 22's experimental
  SQLite API; it is not a horizontally shared store.
- The development encryption key is predictable by design; production startup
  requires externally supplied key material. Key rotation and automated local
  retention/subject deletion are not implemented.
- DynamoDB TTL is eventual, the design is single-region, and no deployed
  restore, load, chaos, alarm-delivery, or disaster-recovery exercise exists.
- Runtime counters and the local rate limiter reset on restart; Lambda counters
  are per warm execution environment and are not SLO metrics.
- Alarm notification routing, custom domain, WAF, email/calendar delivery, and
  analytics are intentionally absent.
- The UI had structural, build, API, and authored browser-test evidence, but
  visual/responsive/browser behavior remained unexecuted in that environment.

## Historical High/Critical review status — 2026-08-30

- Critical findings: **none found** in the executed local path or static review.
- High findings: **all identified implementation findings fixed**.
  - Least-privilege IAM: only `BatchGetItem`, `GetItem`, and
    `TransactWriteItems` on the booking table.
  - Request-abort containment: outer async request boundary catches/logs and
    safely closes or returns a non-sensitive `500`.
  - SQLite file permissions: enforced and tested as `0600`.
  - Form error associations: `aria-describedby`, `aria-invalid`, focusable alert
    and success states.
  - Self-contained synth: `npm run infra:synth` invokes repository-owned
    `scripts/synth.ts` and `app.synth()`; runtime execution remained environment-
    blocked as recorded above.
- Additional High fixes from the adversarial review: raw control-character
  validation, browser-JS parsing during build, Dynamo cancellation mapping tests,
  and a complete evidence/limitation map.

## Historical next action — 2026-08-30

1. In an unrestricted clean runner, run `npm ci --ignore-scripts`,
   `npm run infra:test`, and `npm run infra:synth`; inspect `dist/cdk.out`.
2. Install Playwright Chromium and run `npm run test:browser`; inspect the saved
   desktop, success, and mobile screenshots plus keyboard/error behavior.
3. Open a pull request so GitHub Actions executes the full core, browser, and
   container-build path; only then treat CI/container evidence as observed.
