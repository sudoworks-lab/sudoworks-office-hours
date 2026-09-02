# Service levels

Status: objectives for a future deployed service. No production measurements
exist, and these targets are not claims of achieved reliability.

## Indicators and objectives

| Concern | SLI | Proposed 30-day objective | Source |
| --- | --- | --- | --- |
| API availability | non-throttled booking/slot requests that do not return 5xx ÷ eligible requests | 99.5% | API Gateway access logs and 5xx metric |
| Booking latency | valid `POST /api/bookings` completed below 1 second at the edge | 95% | API Gateway integration latency |
| Slot integrity | slots with more than one accepted owner | exactly 0 | invariant audit of DynamoDB slot locks/bookings |
| Readiness | successful `GET /api/health/ready` probes ÷ readiness probes | 99.5% | health request logs |
| Error clarity | application 4xx/5xx responses with a stable code and request ID | 100% | API contract test/log sampling |

For a 99.5% monthly availability objective, the nominal error budget is about
3 hours 39 minutes in a 30-day month. Planned maintenance is not silently
removed from the denominator.

## Alert intent

- Page-worthy: accepted duplicate ownership (always), sustained 5xx budget burn,
  or readiness failure with user impact.
- Ticket-worthy: intermittent latency regression, TTL backlog, missing access
  logs, or alarm notification drift.
- The CDK stack defines immediate single-period Lambda error,
  throttle, and API 5xx alarms as a conservative bootstrap. A deployed service
  should replace these with multi-window burn-rate alerts once traffic exists.

## Measurement caveats

The engineering panel exposes process-local counters for inspectability. They
reset on restart, are not aggregated in Lambda, and are deliberately excluded
from SLO calculation. There is no deployment receipt, traffic history, alert
destination, or observed baseline in this repository.
