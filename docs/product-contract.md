# Office Hours product contract

Status: active  
Source of truth: the repository BOOTSTRAP brief supplied on 2026-08-30  
Supersedes: nothing; the repository contained no prior design or implementation

## Product promise

SudoWorks is a small, inspectable product that lets a reviewer understand the
person, use an Office Hours booking flow, and verify reliability/platform
engineering decisions from repository evidence. It is not a simulated
dashboard and it does not imply commercial operation.

## Thirty-second outcome

A reviewer should be able to answer these questions from the first screen:

1. What kind of engineer is SudoWorks?
2. What operational problem do they repeatedly solve?
3. What can I use and verify here?
4. Where are the limits and primary evidence?

## Priority order

1. **P0:** Home, coherent information architecture and visual system, Selected
   Projects, Engineering View, and a continuously passing build/test path.
2. **P1:** A working booking vertical slice, duplicate/concurrency safety,
   explicit failure handling, security/privacy baseline, executable CI, IaC,
   and structured observability.
3. **P2:** Architecture, reliability model, SLI/SLO, runbook, failure scenarios,
   evidence, and known limitations.
4. **P3:** Optional integrations only when they do not weaken P0–P2.

## Career narrative

The portfolio may state the following supplied narrative without inventing
employers, scale, metrics, or commercial outcomes:

> AWS, IaC, monitoring, operations, security, and standardization form the
> foundation. The work turns person-dependent operations into reproducible
> systems. Personal development is used to validate CI/CD, containers,
> Kubernetes, observability, and AI-assisted engineering. The intended next
> scope is a common platform used by multiple developers and teams.

## Evidence rules

- Prefer links to executable code, tests, CI, IaC, and operational documents.
- Never show fabricated metrics, dashboards, terminals, incidents, customers,
  employers, or outcomes.
- Never call a repository integrated unless the running path actually uses it.
- Identify personal work as personal work; do not present it as commercial
  experience.
- Do not use `production-ready` or equivalent without defined verification.
- Do not add Kubernetes merely as a technology exhibit.
- FairGate is not part of the booking production path.
- Do not reimplement an existing-project capability without product value.
- Make missing evidence and limitations visible rather than filling gaps with
  confident copy.

## Functional contract

### Browse

- Home tells the supplied career story and offers direct paths to work,
  engineering evidence, and booking.
- Selected Projects distinguishes repository-verifiable work from supplied
  narrative and unavailable external evidence.
- Engineering View shows live, attributable runtime facts and links to source
  evidence. It must not resemble a fictional operations console.

### Book

- A visitor can read available Office Hours slots and submit a booking.
- Exactly one booking may own a slot.
- A retried request with the same idempotency key and payload returns the same
  booking; reuse with a different payload is rejected.
- Validation, conflicts, rate limits, readiness failures, and unexpected
  failures use explicit machine-readable responses.
- The service does not claim calendar or email integration.

### Operate

- Liveness and readiness are distinct.
- Application logs are structured and exclude submitted names/emails.
- Runtime counters come from actual handled requests and reset on process
  restart; they are not historical business metrics.
- CI must execute static checks, tests, build, and container build.
- IaC is reviewable but must be labelled unapplied until deployment evidence
  exists.

## Privacy and security contract

- Collect only name, email, slot, timezone, and explicit privacy consent.
- Validate and bound every client-controlled field and request body.
- Encrypt contact fields at rest and store a keyed hash for duplicate checks.
- Do not place contact data in logs, metrics, URLs, or client persistence.
- Apply browser security headers and restrict state-changing cross-origin
  requests.
- Document retention and deletion gaps honestly.

## Explicit non-goals for this iteration

- Calendar, email, ATS, CRM, FairGate, or analytics integrations.
- Multi-region or active-active deployment.
- Kubernetes deployment.
- Claims that the included cloud configuration has been applied.
- Invented case-study metrics or links to projects not present in this repo.

