# 09 — Business Rules

**Updated per `11-SCHEMA-DECISIONS.md` (approved)** — rework and re-audit rules added below (new sections); all other rules unchanged from the original design.

## Account Hierarchy

- Manager creates Team Lead. Manager creates Auditor.
- Team Lead creates Coder. A Coder is created under, and belongs to, the creating TL's team.
- Coder cannot create any user. Auditor cannot create any user.
- Team Lead cannot create another Team Lead. Team Lead cannot create an Auditor.
- All of the above are enforced server-side regardless of what the frontend allows the user to attempt.

## Chart / Production / Audit Relationship

- **Chart ID** is the single linking key between Production and Audit.
- A Chart can have **multiple Production versions** over time, but exactly one is ever "current" at a given moment. In normal (non-rework) operation, a Coder creates exactly one version and that remains current permanently.
- An Auditor never manually re-enters production information. The Auditor enters only a Chart ID; the system retrieves the **current** linked Production version.
- A Production version can have **multiple Audit records** over time, but normal operation produces exactly one. A second audit against the same version is only possible as an explicit re-audit (see below), which requires the first audit to be `REJECTED`.

## Production Rework

- A `COMPLETED` Production record cannot be edited directly by anyone, including the Coder who created it.
- To correct it, the Coder (or a TL directing the correction) sets it to `REWORK`. This creates a **new Production version**, pre-filled from the current version's data, editable by the Coder. The original version is preserved unchanged and remains queryable in history.
- Once the Coder resubmits (`IN_PROGRESS → COMPLETED` on the new version), the new version becomes current; the previous version's `isCurrent` flag is cleared but the row is never deleted.
- A TL or Manager may `CANCEL` a Production record (e.g., miscoded/wrong project) at any point before it is audited; cancellation is a status change, not a deletion.
- Every status transition on a Production record — creation, rework initiation, cancellation — is written to the compliance `AuditLog`, in addition to the domain data itself preserving the version history.

## Audit Resolution & Re-audit

- A `COMPLETED` Audit Entry cannot be edited by anyone. Corrections happen only through the re-audit path below, never by mutating a finished audit.
- If an Auditor flags an audit `REVIEW_REQUIRED`, only a TL (for their own team's charts) or a Manager can resolve it — to either `COMPLETED` or `REJECTED`.
- `REJECTED` on an audit means the underlying production needs correction; it is the trigger a Coder sees to initiate rework (Production Rework, above).
- Re-auditing the same Production version (as opposed to a fresh audit following a rework-produced new version) is only permitted when the existing audit's status is `REJECTED`. Re-audit **always creates a new `AuditEntry` row** — the original is never overwritten — so historical accuracy/CPH metrics and Auditor performance tracking remain correct as of the time they were recorded.

## Identity Rules

- Coder identity (Name, Employee ID, Login Name) is always derived from the authenticated session — never a manually typed field on the Production form.
- Auditor identity (Name, Employee ID, Login Name) is always derived from the authenticated session — never a manually typed field on the Audit form.

## Production Fields

Required: Chart ID, Page Count, Total ICDs, Total DOS, Status, Coded Date.
Optional: Remarks.
**No JCD field exists on this form, in this table, or in any calculation derived from it.**

## Audit Fields

Auto-retrieved (read-only to the Auditor): Coder Name, Coder Employee ID, Coder Login Name, Page Count, Total DOS, Total ICDs, Coded Date, Production Status.

Entered by Auditor: Audit Errors, Error Exceptions, Status, Audit Date, Remarks.

System-calculated: **Total Number of Errors = Audit Errors + Error Exceptions.** This calculation happens in the backend and is authoritative; the frontend may echo it for display but the persisted value always comes from a server-side recomputation at write time.

**No JCD field exists on this form, in this table, or in any calculation derived from it.**

## Chart Assignment

- v1 does not use formal chart pre-assignment: a Coder enters a Chart ID directly on the Production form, and the system creates the Chart record automatically if it doesn't already exist.
- The schema reserves `assignedCoderId`/`assignedById`/`assignedAt` on Chart for a future formal-assignment workflow, but v1 business logic does not populate or enforce these fields.
- Visibility: Manager sees all charts. A Team Lead sees charts belonging to projects assigned to their team. A Coder sees charts they have personally submitted production against.

## Auditor Assignment

- A Manager assigns each Auditor to one or more Projects (`AuditorProjectAssignment`).
- An Auditor's queue is every chart within their assigned project(s) whose current Production status is `COMPLETED` and which has no open (`PENDING`/`IN_PROGRESS`) audit — the Auditor is not restricted to individually pre-assigned charts within that project.
- An Auditor cannot fetch or audit a chart outside their assigned projects.

## Productivity / CPH

Charts Per Hour is derived from configurable inputs (charts, hours, pages, DOS, ICDs) via a formula that is not hardcoded into application logic — it reads from a configuration record so the business can adjust the CPH definition without a code deployment. No additional medical-coding metrics (e.g., no JCD-based metric) are introduced beyond what's explicitly listed here.

## Reporting

Production and Audit reports expose exactly the field sets specified in the brief (Chart ID, Coder, Employee ID, Pages, DOS, ICDs, Status, Coded Date for Production; the equivalent Audit field set including Total Errors) — no additional invented columns, and specifically no JCD column.

## Login Name Allocation & History (Phase 9)

- Login Name is an auditable **allocation identity**, not merely a mutable field on `User`. Every Login Name ever held by every account (Internal/Vendor/TL/Coder/Auditor) is recorded, append-only, in `LoginNameAllocation`.
- **Invariant, enforced in the database** (PostgreSQL partial unique indexes, not just application code): at most one `ACTIVE` allocation may exist for a given `loginName`, and at most one `ACTIVE` allocation may exist for a given `userId`.
- Status is one of exactly `ACTIVE`, `DEACTIVATED`, `REALLOCATED` — no other statuses exist.
- History rows are **never overwritten or deleted**. Reassigning a Login Name closes the existing `ACTIVE` row (`status → REALLOCATED`, `deallocatedAt`/`deallocatedById` set) and creates a new `ACTIVE` row, both inside one database transaction.
- The existing Login Name change workflow is unchanged and still authoritative: a Team Lead requests a Coder's Login Name change → Manager approval → `UsersService.changeLoginName` applies it. That same call now also reassigns the `LoginNameAllocation` history, in the same transaction as the `User.loginName` update, the `ApprovalRequest` completion, and the audit log entry — if any step fails, the entire change (including the Login Name itself) rolls back, so a Login Name is never changed without its allocation history changing to match, or vice versa.
- A Manager may search and view current/historical allocations, but cannot reassign a Login Name from the allocation screens directly — reassignment only happens through the approved change workflow above.
- Historical allocation rows join to the user's **current** organizational placement (vendor/team/team lead) for display — they are not a point-in-time snapshot of the org structure at the time of allocation.
- Pre-existing accounts (from before Phase 9) are backfilled by a standalone, idempotent script (`apps/api/scripts/backfill-login-name-allocations.ts`), not by the migration itself — this avoids depending on a database-generated UUID function that isn't used anywhere else in this schema. The script is safe to re-run: it skips any user who already has an `ACTIVE` allocation.
- Backfilled rows leave `allocatedById` **null** rather than attributing the allocation to the account holder themselves or to a fabricated Manager — there is no real historical actor to record for a pre-existing account. This mirrors `AuditLog.userId`, already nullable in this schema for system-origin events. `allocatedById` is nullable for exactly this reason; every allocation a real Manager creates or reallocates always carries a real `allocatedById`. Backfilled rows are explicitly marked via `reason = 'INITIAL_BACKFILL: ...'` and are also logged to `AuditLog` (`action: 'LOGIN_NAME_ALLOCATION_BACKFILLED'`, `userId: null`).
- Every allocation/reallocation is written to the existing `AuditLog` — there is no separate/parallel audit mechanism for Login Name history.

## Manager Login Name Details (Phase 9)

- Manager-only screen (`/manager/login-name-details`) for searching Login Names by Login Name, Employee ID, Employee Name, or Email, with Role/Vendor/Team/Team Lead/Status filters.
- Selecting a result shows its current allocation plus its complete history — reachable, but not editable, from this screen.

## Employee Directory (Phase 9)

- Manager-only screen (`/manager/employees`) — a searchable, paginated, enterprise-wide account directory. It is not a CRM/ATS.
- Columns: EMP-ID, Employee Name, Login Name, Email, Role, Vendor, Team, Team Lead, Active/Inactive, Created Date. There is intentionally no Online/Offline column — no presence/session tracking exists yet in this system, and this phase does not invent placeholder presence data.
- Search and every filter (Role, Active/Inactive, Vendor, Team, Team Lead) are server-side; the directory is always paginated and the full list is never loaded into the browser at once.
- The detail view groups fields as Identity (EMP-ID/Name/Email/Login Name), Account (Role/Active-Inactive/Created Date), and Organization (Vendor/Team/Team Lead), plus the employee's Login Name allocation history. Password hashes, reset tokens, and access/refresh tokens are never returned by the API and never rendered.
- Enforced server-side for Manager only (route-level `@Roles('MANAGER')` guard on both `manager/login-name-allocations` and `manager/employees`) — hiding the nav entry for other roles is a convenience, not the security boundary.
