# Publication-candidate receipt

Generated: 2026-09-01 (UTC)  
Scope: local publication-candidate evidence closure only  
Independent review: intentionally not performed in this session

## Readiness manifest

```text
OFFICE_HOURS_RUNTIME_VALIDATED=true
BROWSER_VALIDATED=true
CDK_SYNTH_EXECUTION=PASS
CURRENT_RETAINED_CDK_ARTIFACTS=ABSENT
AWS_DEPLOY_VALIDATED=false
CONTAINER_VALIDATED=true
CI_EQUIVALENT_VALIDATED=true
GITHUB_ACTIONS_LIVE_RUN=false
DIRECT_EXTERNAL_GITHUB_DESTINATION=ABSENT
EXTERNAL_ACCOUNT_API_REPOSITORY_LOCATORS=ABSENT
PUBLIC_TIMEZONE_SIGNAL=UTC_ONLY
PRIVACY_AUDIT_PASS=true
PORTFOLIO_SHELL_READY=true
READY_FOR_PUBLICATION=false
```

`READY_FOR_PUBLICATION=false` means the assembled candidate is ready for a
Fresh Session independent review, not that a known local validation is failing.
The remote-only hosted CI run is also still absent. No commit, push, AWS
deployment, registry publication, or other remote mutation occurred.

## Candidate path set

The source candidate is the current non-ignored workspace path set:

```text
.dockerignore
.github/workflows/ci.yml
.gitignore
Dockerfile
README.md
cdk.json
docs/**
infra/**
package-lock.json
package.json
public/**
scripts/**
src/**
test/**
tsconfig.json
```

Generated validation artifacts are evidence, not source-candidate paths, and
remain ignored by Git:

```text
dist/**
reports/fixer-desktop-portfolio-utc.png
reports/fixer-mobile-portfolio-utc.png
reports/fixer-booking-success-utc.png
```

## Validation environment

- Node `v22.22.2`
- npm `10.9.7`
- Playwright `1.62.1`, Chromium revision `1234`
- Docker client/server `29.6.2`
- AWS credentials/profile variables were removed for the CDK validation command;
  EC2 instance metadata access was disabled.

## Exact commands and results

### Locked install

```bash
npm ci --ignore-scripts
```

**PASS:** 43 packages installed, 64 audited, 0 vulnerabilities reported.

### Core, runtime, build, and credential-free CDK validation

```bash
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE -u AWS_DEFAULT_PROFILE AWS_EC2_METADATA_DISABLED=true npm run verify:core
```

`verify:core` expanded exactly to:

```text
npm run check && npm test && npm run build && npm run infra:test && npm run infra:synth
```

**PASS:**

- dependency tree, TypeScript, and repository text checks passed;
- application tests: 15 passed, 0 failed;
- local/browser/Lambda bundles built and the Lambda handler load check passed;
- CDK assertion tests: 1 passed, 0 failed;
- `infra:synth` completed and printed
  `CDK cloud assembly synthesized to dist/cdk.out. No deployment was performed.`

Node emitted the documented experimental SQLite warning. CDK emitted the
existing `FunctionOptions#logRetention` deprecation warning. Neither was a test
failure.

The synthesis execution produced a valid assembly during `verify:core`. A
read-only assertion over that execution returned 50 resources and the following
required type counts:

```text
AWS::S3::Bucket                 1
AWS::CloudFront::Distribution  1
AWS::ApiGateway::RestApi       1
AWS::Lambda::Function          3
AWS::DynamoDB::Table           1
AWS::SecretsManager::Secret    1
```

The later mandatory `npm run build` deliberately recreated `dist/`, so no CDK
assembly is retained in the final current workspace. These are separate facts:

```text
CDK_SYNTH_EXECUTION=PASS
CURRENT_RETAINED_CDK_ARTIFACTS=ABSENT
```

This proves local synthesis execution and resource intent only. No AWS
credential was required, no deploy command ran, and no AWS/cloud state was read
or mutated. `AWS_DEPLOY_VALIDATED=false` remains mandatory.

### Post-UTC browser validation

```bash
npm run test:browser
```

**PASS:**

```text
pages: portfolio landing, featured, supporting, engineering, technical conversation request
states: initial, submitting, validation error, unexpected error, conflict error, success
viewports: 1440x1000, 390x844
timezone: UTC
unexpected console errors: 0
page errors: 0
failed network requests: 0
desktop horizontal overflow: false
mobile horizontal overflow: false
semantic landmarks: passed
keyboard focus: passed
```

Chromium generated exactly three native HTTP console diagnostics for the
intentionally exercised `400 Bad Request`, `500 Internal Server Error`, and `409
Conflict` booking responses.
The harness asserts all three status/path pairs and separately requires zero
unexpected/application console errors; this expected diagnostic evidence is not
suppressed. The three fresh screenshots were visually inspected. They show UTC,
no host timezone, no horizontal clipping/overflow, and no new visible layout
regression. The automated checks are not represented as a new independent or
full manual accessibility audit.

One intermediate instrumentation run failed because it initially treated the
expected Chromium HTTP diagnostics as unexpected console errors. The final
harness now classifies and asserts the exact negative-path diagnostics rather
than ignoring them.

The unexpected-error state is created only by test-side Playwright request
interception, which fulfills one booking request with HTTP 500. There is no
production fault-injection hook, query switch, environment switch, or
error-only endpoint. Accessibility focus checks remain enabled; focus is then
cleared and absence of `:focus` is asserted before each Human-review capture.

### Docker image and runtime

```bash
docker build --tag sudoworks-office-hours:publication-candidate .
```

**PASS:** image
`sha256:c7e9e3b609137a162c590ee33f531f695c4941b32b2b17bbbd9a581a63304185`
was built from the pinned Node `22.22.1-bookworm-slim` stages.

The runtime probe generated an ephemeral 32-byte validation key without printing
or retaining it, then used the documented production variable:

```bash
docker run --rm -d --name sudoworks-office-hours-publication-candidate \
  -p 127.0.0.1:3017:3000 \
  --env BOOKING_ENCRYPTION_KEY=<ephemeral-32-byte-base64-validation-key> \
  sudoworks-office-hours:publication-candidate
curl --fail http://127.0.0.1:3017/api/health/live
curl --fail http://127.0.0.1:3017/api/health/ready
```

**PASS:** liveness returned `{"status":"live","service":"office-hours"}`;
readiness returned `{"status":"ready","storage":"sqlite"}`; Docker reported
`healthy`; the process ran as UID/GID `1000`; the validation container was then
stopped and removed.

An earlier exploratory probe used the wrong variable name
`CONTACT_KEY_BASE64`; production startup correctly failed closed. The final
documented `BOOKING_ENCRYPTION_KEY` invocation above is the container validation
result and the earlier operator error is retained here rather than concealed.

### Local CI equivalence and references

The final local sequence was:

```bash
npm ci --ignore-scripts
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE -u AWS_DEFAULT_PROFILE AWS_EC2_METADATA_DISABLED=true npm run verify:core
npm run test:browser
docker build --tag sudoworks-office-hours:publication-candidate .
```

All four commands passed using the installed pinned Chromium. This validates the
local behavioral equivalent of the workflow's install/core/browser/container
path; it does not claim execution on a GitHub-hosted runner.

Read-only reference checks passed:

- generated HTML: 13 references checked; all 12 local asset/fragment references
  resolved;
- local Markdown links resolved;
- no rendered external source-host destination exists;
- `git diff --check` exited 0 with no output.

Because the repository has no `HEAD` and every candidate path is untracked,
`git diff --check` has no tracked diff to inspect. The passing repository text
checks and current `git status` provide the applicable local consistency
evidence for the untracked candidate.

## Browser evidence

The canonical Fixer receipt records the three final Human-review screenshot
paths and SHA-256 values after the fresh UTC capture. No current CDK artifact
hash is claimed because the final build leaves retained CDK artifacts absent.

## Public privacy audit

Scope: `public/`, `dist/public/`, public metadata, `README.md`, `docs/`, the
fresh PNG screenshots, and CDK output inspected during synthesis before the
final build removed it. Actual secret values were neither requested nor printed.

**PASS:**

- real identity or personal initials: none;
- author/operator location or host timezone signal: none; screenshots and
  browser context use neutral UTC;
- employer/customer names: none;
- personal email or phone: none;
- private filesystem paths: none;
- private hostname/IP: none; loopback URLs occur only in documented local
  evaluation commands and are not rendered public-site links or host identity;
- private repository names: none; no repository remote is configured;
- personal social links: none; no rendered external source-host destination
  exists;
- secret/token findings in source public files, generated web output, public
  docs, screenshots, workflow, and package metadata: none;
- screenshot OCR found no email address, phone number, private path, private
  host/IP, personal social destination, or host-timezone location string;
- PNGs contain only `IHDR`, `IDAT`, and `IEND` chunks and no embedded text/EXIF
  metadata.

CDK construct creation-stack metadata is disabled in both repository synth
entry points. The regenerated complete build/assembly text scan found zero
private filesystem paths, private account identifiers, or fixed host-location
strings.

The redacted secret scanner reported 12 `generic-api-key` findings in the
temporary CDK output present during synthesis:

```text
5  dist/cdk.out/SudoWorksOfficeHours.assets.json  objectKey
4  dist/cdk.out/SudoWorksOfficeHours.template.json S3Key
3  dist/cdk.out/tree.json s3Key
```

Each finding is a deterministic CDK asset object identifier in an
`objectKey`/`S3Key` field, not credential material. No finding value was
inspected or reproduced. Classification:

```text
GENERATED_ASSET_IDENTIFIER_FALSE_POSITIVE=12
```

The classification is retained explicitly and was not silently suppressed. The
generated files themselves are absent after the final mandatory build.

## Public claim audit

### NOC-AI

The current rendered portfolio presents NOC-AI as the flagship. It limits claims
to approval-bound operational actions, durable control-plane state, API / Worker
separation, PostgreSQL jobs and leases, crash recovery, stale-owner rejection,
contention validation, uncertain-write reconciliation, independent Verification,
and completed real failure-injection scenarios. The 7-day soak is **IN
PROGRESS**; commercial production, enterprise adoption, and general exactly-once
behavior are **NOT CLAIMED**.

### Hooklane

The current rendered portfolio presents Hooklane as Featured and bounds its
public copy to reliable asynchronous delivery, retry, and recovery. It makes no
metric, adoption, scale, or unverified implementation claim.

### Office Hours

Current public claims are supported and bounded as follows:

- real local persistence, booking success, replay, validation, conflict, and
  single-owner behavior are supported by current tests/browser/runtime evidence;
- SQLite is described as local and single-host; DynamoDB is described only as an
  AWS-shaped conditional-transaction path;
- AES-GCM contact protection and privacy-safe logging are test-backed;
- browser/mobile/accessibility wording is limited to the executed automated
  checks and inspected screenshots;
- CDK is described as synthesized/reviewable and explicitly unapplied;
- the site states that booking storage does not notify an operator, send email,
  or create a calendar invitation;
- no customer, scale, production, commercial outcome, deployed-AWS, or achieved
  SLO claim appears.

## Historical evidence repair

The following dated records retain their original blocker evidence under an
explicit **HISTORICAL ENVIRONMENT BLOCKER** label and separately record the
**CURRENT REVALIDATION RESULT**:

```text
docs/evidence/final-review.md
docs/evidence/implementation.md
docs/receipts/independent-review.md
docs/receipts/overnight-latest.md
docs/receipts/phase-00-audit.md
```

The independent review's historical verdict was not changed and no independent
review was performed in this session.

## Hosted CI and remote-only gap

The candidate has no committed baseline or configured remote, and no live hosted
CI result exists. No account, API, organization, profile, or repository locator
is recorded. Therefore `GITHUB_ACTIONS_LIVE_RUN=false`. Workflow presence and
local CI-equivalent success are not presented as a live hosted result. Closing
this gap requires a future authorized commit/push and remote run; neither is
allowed in this session.

## Known limitations

- No AWS deployment, cloud mutation, edge-runtime check, alarm delivery, restore,
  load, chaos, or disaster-recovery exercise exists.
- No live hosted CI run exists.
- Office Hours stores a reservation but has no operator handoff, email, calendar,
  CRM, or public live-service claim.
- Local SQLite is single-host; retention/deletion automation and encryption-key
  rotation are not implemented.
- Runtime counters are process-local and are not historical business/SLO data.
- The automated landmark/focus/layout checks and screenshot inspection are not a
  replacement for the requested Fresh Session independent review.

## Changed path boundary

There is no `HEAD`; all candidate files are currently untracked. `git status`
remains the canonical current path list, so this receipt does not freeze a stale
embedded copy.

## Publication-candidate decision

The local candidate/evidence work is complete and the portfolio shell is ready
for independent review. Publication itself remains **not authorized/not yet
ready in this session** because that independent review must occur in a Fresh
Session and the remote-only GitHub Actions status remains explicitly unvalidated.
