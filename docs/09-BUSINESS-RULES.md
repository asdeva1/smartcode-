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
