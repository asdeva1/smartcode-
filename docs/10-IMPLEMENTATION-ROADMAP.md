# 10 — Implementation Roadmap

## Testing Strategy

| Level | Tool | Scope |
|---|---|---|
| Unit | Jest | Services in isolation (e.g., `AuditService.calculateTotalErrors()`, RBAC guard logic) with mocked Prisma client |
| Integration | Jest + Supertest | Controller → service → test database, per module (e.g., "POST /api/audits with a valid chartId creates an AuditEntry and computes totalErrors correctly") |
| API | Supertest | Auth/authz boundary tests — every endpoint tested against every role to confirm the RBAC matrix is actually enforced, not just documented |
| E2E | Playwright | Full browser flows against a running stack |

**Critical E2E test (must pass before any release):**

```
1. Manager logs in, creates a Team Lead
2. Team Lead logs in, creates a Coder
3. Coder logs in, submits Production for Chart ID CH20260915002
   (Page Count 40, DOS 5, ICDs 18, Status COMPLETED, Coded Date 15-09-2026)
4. Auditor logs in, enters CH20260915002, clicks Fetch
5. Assert: Coder name/employee ID/login, page count, DOS, ICDs,
   coded date, production status are all displayed read-only and match step 3
6. Auditor enters Audit Errors = 2, Error Exceptions = 1
7. Submits audit
8. Assert: Total Errors = 3, persisted, and visible in the Auditor's completed audits list
```

This exact scenario is the acceptance test for the whole vertical slice — it's referenced again in Phase 4 below.

## Phased Roadmap

| Phase | Scope | Exit Criteria |
|---|---|---|
| **1 — Foundation** | Monorepo scaffold, Docker Compose (web/api/postgres/redis), Prisma schema from `02-DATABASE-DESIGN.md`, design system primitives, CI skeleton (lint/typecheck/test on PR) | `docker compose up` boots all four services; health-check endpoints green; design system Storybook (or equivalent) renders the primitive components |
| **2 — Auth & RBAC** | Login, JWT issue/refresh, `AuthProvider` abstraction, `Role`/`UserRole`, guards, hierarchy-enforced user creation endpoints, seed script for one Manager | Manager logs in; wrong-role requests return 403; hierarchy rules (TL can't create TL/Auditor, etc.) enforced and covered by API-level tests |
| **3 — Chart + Production** | Chart auto-link on first Production submission, versioned Production CRUD (incl. rework endpoint), Coder workspace UI, coder identity auto-fill | Coder can submit/edit production while `PENDING`/`IN_PROGRESS`; a second submission for an existing current version is rejected with 409; rework creates a new version without touching the original; Production report lists correctly |
| **4 — Audit** | Chart ID fetch endpoint + UI, read-only production panel, Audit form, server-side Total Errors calculation, resolve/re-audit endpoints | **The critical E2E test above passes end-to-end**; re-audit only creates a new row after a `REJECTED` status, original audit row untouched |
| **5 — Manager & TL Workspaces** | Team management, assignment screens, scoped dashboards | Manager sees all data, TL sees only their team's data, verified by API-level authz tests |
| **6 — Dashboards, Reports, CPH** | Report tables (search/filter/sort/pagination), XLSX/CSV/PDF export via BullMQ, CPH configuration + calculation | Exports download correctly and match on-screen data; CPH recalculates when config changes |
| **7 — Notifications, Activity Logs, Audit Logs** | Notification module, activity feed, full `AuditLog` coverage of the Section 19 action list | Every listed action produces exactly one log row with correct before/after snapshot |
| **8 — Testing & Hardening** | Full Jest/Supertest/Playwright suite, rate limiting, security headers, CORS lockdown, dependency audit | CI green on all test levels; no critical/high vulnerabilities in `npm audit` |
| **9 — AWS Deployment Prep** | IaC (Terraform/CDK — to be chosen), ECS task definitions, RDS/ElastiCache provisioning scripts, Secrets Manager wiring | Staging environment deploys successfully from CI; smoke test passes against staging |
| **10 — Production Release** | Cutover plan, rollback plan, monitoring dashboards (CloudWatch + Sentry) live | Production deploy succeeds; monitoring confirms healthy baseline |

## Important Assumptions (stated so they can be corrected)

1. **[RESOLVED — see `11-SCHEMA-DECISIONS.md`]** Production is versioned (Chart 1:N ProductionEntry, one `isCurrent` per chart); Audit is 1:N against a Production version, constrained in v1 logic to one active audit per version with re-audit permitted only after a `REJECTED` status.
2. **[RESOLVED]** A Chart record is auto-created the moment a Coder submits the first Production entry against a new Chart ID. Formal pre-assignment fields are reserved on the schema but unused by v1 logic.
3. `Client` and `Project` entities exist in the schema but v1 UI only needs minimal management of them — full CRM-style client management is out of scope per Section 9. *(unchanged, not part of the 7 schema decisions)*
4. **[RESOLVED]** Production editing is allowed only while status is `PENDING` or `IN_PROGRESS`; correcting a `COMPLETED` record requires the `REWORK` path, which creates a new version rather than editing in place.
5. Auth is native JWT in v1, architected behind an interface for a Keycloak swap later. *(unchanged)*
6. **[RESOLVED]** Status enums finalized: `ProductionStatus = PENDING | IN_PROGRESS | COMPLETED | REWORK | CANCELLED`; `AuditStatus = PENDING | IN_PROGRESS | COMPLETED | REVIEW_REQUIRED | REJECTED`.

## Open Questions Requiring Business Confirmation

Of the original 7, items 1, 2, 3, and 6 (chart lifecycle, edit window, re-audit relationship, status enums) are now resolved via `11-SCHEMA-DECISIONS.md` (approved). Remaining open:

1. **"Assign Auditor to project"** — resolved structurally (Auditor↔Project via `AuditorProjectAssignment`, queue-based); still open whether a Project maps to a real client engagement or is informal grouping metadata for v1 — determines how much Project-management UI is real work versus placeholder.
2. **CPH hour input** — how are "hours worked" captured: manually logged by the Coder, derived from login/logout session time, or entered by the TL? Blocks Phase 6 (Productivity) until answered.
3. **Frontend hosting choice** — Vercel for the Next.js tier, or keep everything inside the AWS account on ECS? Affects Phase 9 setup.

Neither remaining item blocks Phase 1 (foundation/scaffolding) or Phase 2 (auth/RBAC/hierarchy). CPH (item 2 above) should be resolved before Phase 6 begins; the Project/Client question can be deferred until Phase 5 (Manager & TL workspaces) without risk.
