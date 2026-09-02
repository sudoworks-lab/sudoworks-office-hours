# Implementation evidence map

## Evidence chronology

**HISTORICAL ENVIRONMENT BLOCKER — 2026-08-30:** Chromium, Docker/Podman,
and runnable CDK internals were unavailable in the original environment. Those
failures are preserved in the dated receipts.

**CURRENT REVALIDATION RESULT — 2026-09-01:** the post-UTC browser suite,
credential-free `npm run verify:core` including CDK assertions/synth, and a fresh
Docker image/runtime probe all pass. AWS deployment and a live GitHub Actions run
remain unvalidated. See `docs/receipts/publication-candidate.md` for commands and
artifacts.

| Claim | Evidence | Validation | Limitation |
| --- | --- | --- | --- |
| Successful booking | `src/domain/booking-service.ts` | domain, HTTP, live-service, and current desktop/mobile Playwright success checks | No operator notification, email, or calendar side effect |
| Duplicate retry returns original | repository contract and both adapters | domain, HTTP, SQLite restart, and Dynamo cancellation tests | Replay retention ends with stored record retention |
| Concurrent slot has one owner | SQLite transaction / DynamoDB transaction | concurrent domain test, two-connection SQLite test, live eight-request check | DynamoDB behavior is mocked locally, not exercised in AWS |
| Invalid input is explicit | `src/domain/validation.ts`, `src/http/api.ts` | domain, HTTP, live-service, and current Playwright validation/conflict checks | Email validation is syntactic only |
| Local persistence survives restart | `src/local/sqlite-booking-repository.ts` | SQLite restart test and live process restart check | One-host design; no horizontal sharing |
| Contact data protected at rest | `src/shared/contact-protector.ts` | randomized-ciphertext and log-redaction tests | No key rotation or subject-deletion automation |
| AWS-shaped path | `src/aws/*`, `scripts/build.mjs` | typecheck, load-checked Lambda artifact, safe missing-config smoke, and Dynamo command/mapping tests | Lambda has not run in AWS |
| Infrastructure intent | `infra/office-hours-stack.ts` | current credential-free `verify:core` passed the CDK assertion and synth paths; generated template core resources were checked | Synthesis is local intent evidence only; no AWS deployment occurred |
| Structured observability | logger, runtime counters, health routes, CDK logs/alarms/X-Ray | HTTP tests and live Engineering View response | Counters are per-process; alarms have no notification target |
| User-visible UX | `public/*` | current Chromium run passed desktop/mobile, validation/conflict/success, UTC, no-overflow, landmark, and keyboard-focus checks; screenshots inspected | No claim of a fresh independent accessibility audit |
| Container packaging | `Dockerfile` | current image build passed; fresh non-root runtime returned live/ready and became Docker `healthy` | No registry publication or remote runtime is evidenced |
| CI executable path | `.github/workflows/ci.yml`, `Dockerfile` | local core, browser, image-build, and container-runtime equivalents passed | No GitHub Actions live run exists |

Evidence is repository-local. It does not prove AWS deployment, GitHub Actions
execution, alarm delivery, real-world traffic levels, email delivery, or
calendar integration.
