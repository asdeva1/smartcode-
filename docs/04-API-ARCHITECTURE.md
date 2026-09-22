# 04 — API Architecture

REST, versioned under `/api`, documented via OpenAPI/Swagger at `/api/docs`. All endpoints require a valid JWT except `/api/auth/login` and `/api/auth/refresh`.

**Updated per `11-SCHEMA-DECISIONS.md` (approved):** rework, re-audit, and auditor-project-assignment endpoints added below. All other endpoints from the original design are unchanged.

## Auth — `/api/auth`

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/api/auth/login` | POST | Public | Rate-limited; logs `LOGIN` or `LOGIN_FAILED` |
| `/api/auth/refresh` | POST | Refresh token (httpOnly cookie) | Issues new access token |
| `/api/auth/logout` | POST | Access token | Logs `LOGOUT`, invalidates refresh token |
| `/api/users/me` | GET | Any authenticated role | Returns current user + role |

## Users — `/api/users` and role-scoped creation endpoints

Creation is split into explicit endpoints per your example, rather than one generic `POST /users`, so the allowed-caller-role check is structural, not conditional logic buried in one handler:

| Endpoint | Method | Caller | Notes |
|---|---|---|---|
| `/api/manager/team-leads` | POST | Manager only | Creates a TL |
| `/api/manager/auditors` | POST | Manager only | Creates an Auditor |
| `/api/team-leads/coders` | POST | Team Lead only | Creates a Coder, auto-assigned to caller's team |
| `/api/users` | GET | Manager (all) / TL (own team) / self | Scoped list |
| `/api/users/:id` | GET, PATCH | Scoped per RBAC matrix | |
| `/api/users/:id/activate` | PATCH | Manager (TL/Auditor) / TL (own Coders) | |
| `/api/users/:id/deactivate` | PATCH | Manager (TL/Auditor) / TL (own Coders) | |

## Teams — `/api/teams`

| Endpoint | Method | Caller |
|---|---|---|
| `/api/teams` | POST, GET | Manager |
| `/api/teams/:id/assign-lead` | PATCH | Manager |
| `/api/teams/:id/members` | POST | Manager or TL (own team) |

## Charts — `/api/charts`

| Endpoint | Method | Caller | Notes |
|---|---|---|---|
| `/api/charts/:chartId` | GET | Auditor, Manager, TL | Chart lookup by business ID |
| `/api/charts/:chartId/production` | GET | Auditor, Manager, TL | This is what the Auditor's "Fetch" button calls — returns the linked ProductionEntry with coder identity joined in |

## Production — `/api/production`

| Endpoint | Method | Caller | Notes |
|---|---|---|---|
| `/api/production` | POST | Coder | `coderId` taken from JWT, never from body |
| `/api/production` | GET | Scoped (own/team/all) | filters: status, dateRange, chartId, page/pageSize |
| `/api/production/:id` | GET, PATCH | Scoped, status-gated for edit | Edit only while status is `PENDING` or `IN_PROGRESS` |
| `/api/production/:id/rework` | POST | Coder (own) or TL (own team) | `COMPLETED → REWORK`; creates a new `ProductionEntry` version pre-filled from the current one, flips `isCurrent` to the new row. Original version is never modified. |
| `/api/production/:id/cancel` | POST | TL (own team) or Manager | Sets status `CANCELLED`; does not delete the row |
| `/api/charts/:chartId/production-history` | GET | Manager, TL (own team), Auditor (own project) | Returns all versions of a chart's production, ordered, for audit-trail/reporting purposes |

## Audit — `/api/audits`

| Endpoint | Method | Caller | Notes |
|---|---|---|---|
| `/api/audits` | POST | Auditor | Body includes `chartId`; server resolves `productionEntryId` server-side, computes `totalErrors` server-side, rejects if a client-supplied `totalErrors` doesn't match the computed value |
| `/api/audits` | GET | Scoped (own/team/all) | |
| `/api/audits/:id` | GET, PATCH | Scoped, status-gated for edit | Edit only while status is `PENDING` or `IN_PROGRESS`; `COMPLETED` audits are immutable |
| `/api/audits/:id/resolve` | POST | TL (own team) or Manager | Resolves a `REVIEW_REQUIRED` audit to `COMPLETED` or `REJECTED` |
| `/api/audits/:id/reaudit` | POST | Auditor (own project) or Manager | Only callable when the target audit's status is `REJECTED`. Creates a **new** `AuditEntry` row against the same `productionEntryId`; the original row is preserved unchanged |
| `/api/charts/:chartId/audit-history` | GET | Manager, TL (own team), Auditor (own project) | Returns all audit rows for the chart's current production version, ordered — the compliance-facing view of re-audit history |

## Auditor Project Assignment — `/api/manager/auditor-assignments`

| Endpoint | Method | Caller | Notes |
|---|---|---|---|
| `/api/manager/auditor-assignments` | POST | Manager | Assigns an Auditor to a Project (implements the approved Question 6 decision) |
| `/api/manager/auditor-assignments` | GET | Manager | List all assignments |
| `/api/manager/auditor-assignments/:id` | DELETE | Manager | Unassigns |
| `/api/auditor/queue` | GET | Auditor | Charts across all of the caller's assigned projects where current production `status = COMPLETED` and no open (`PENDING`/`IN_PROGRESS`) audit exists |

## Reports — `/api/reports`

| Endpoint | Method | Notes |
|---|---|---|
| `/api/reports/production` | GET | Paginated, filterable, sortable |
| `/api/reports/audit` | GET | Same |
| `/api/reports/productivity` | GET | CPH, per user/team/date range |
| `/api/reports/production/export` | GET | `?format=xlsx\|csv\|pdf`, queued via BullMQ, returns a signed S3 download URL when ready |
| `/api/reports/audit/export` | GET | Same pattern |

## Notifications & Logs

| Endpoint | Method | Caller |
|---|---|---|
| `/api/notifications` | GET | Self |
| `/api/notifications/:id/read` | PATCH | Self |
| `/api/activity-logs` | GET | Scoped per RBAC matrix |
| `/api/audit-logs` | GET | Manager only |

## Cross-cutting API rules

- **DTO validation**: every request body validated with `class-validator` DTOs on the Nest side, mirrored by Zod schemas on the frontend (shared via the `packages/shared-types` workspace) so both sides reject the same bad input for the same reason.
- **Pagination**: all list endpoints accept `page`, `pageSize` (default 25, max 100), return `{ data, total, page, pageSize }`.
- **Errors**: consistent shape `{ statusCode, message, error, timestamp, path }` via a global exception filter — no raw stack traces returned to the client.
- **Idempotency**: `POST /api/production` and `POST /api/audits` reject duplicate submissions against the same `chartId` with a `409 Conflict` rather than silently creating a second row (this is what enforces the "one production per chart" / "one audit per production" business rule at the API boundary, in addition to the DB unique constraint).
