# 02 — Database Design

PostgreSQL, accessed via Prisma. Normalized to 3NF; no JCD field exists anywhere in this schema.

**Updated per `11-SCHEMA-DECISIONS.md` (approved):** Production is versioned (supports rework without restructuring), Audit is 1:N against a Production version (supports re-audit), Chart carries reserved assignment fields, and both status enums are expanded accordingly.

## ERD

```mermaid
erDiagram
    USER ||--o{ USER : "createdBy"
    ROLE ||--o{ USER_ROLE : ""
    USER ||--o{ USER_ROLE : ""
    TEAM ||--o{ TEAM_MEMBER : ""
    USER ||--o{ TEAM_MEMBER : ""
    CLIENT ||--o{ PROJECT : ""
    PROJECT ||--o{ CHART : ""
    TEAM ||--o{ PROJECT : "assigned"
    USER ||--o{ AUDITOR_PROJECT_ASSIGNMENT : ""
    PROJECT ||--o{ AUDITOR_PROJECT_ASSIGNMENT : ""
    USER ||--o{ PRODUCTION_ENTRY : "codes"
    USER ||--o{ AUDIT_ENTRY : "audits"
    CHART ||--o{ PRODUCTION_ENTRY : "versions"
    PRODUCTION_ENTRY ||--o{ AUDIT_ENTRY : "audits"
    USER ||--o{ NOTIFICATION : "receives"
    USER ||--o{ ACTIVITY_LOG : "performs"
    USER ||--o{ AUDIT_LOG : "performs"

    USER {
        uuid id PK
        string employeeId UK
        string loginName UK
        string email UK
        string passwordHash
        uuid createdById FK
        boolean isActive
        datetime lastLoginAt
        datetime createdAt
        datetime updatedAt
    }
    ROLE {
        uuid id PK
        string name UK "MANAGER|TEAM_LEAD|CODER|AUDITOR"
    }
    USER_ROLE {
        uuid id PK
        uuid userId FK
        uuid roleId FK
    }
    TEAM {
        uuid id PK
        string name
        uuid teamLeadId FK
        datetime createdAt
    }
    TEAM_MEMBER {
        uuid id PK
        uuid teamId FK
        uuid userId FK
        datetime joinedAt
    }
    CLIENT {
        uuid id PK
        string name
        boolean isActive
    }
    PROJECT {
        uuid id PK
        uuid clientId FK
        uuid teamId FK
        string name
        boolean isActive
    }
    AUDITOR_PROJECT_ASSIGNMENT {
        uuid id PK
        uuid auditorId FK
        uuid projectId FK
        datetime assignedAt
    }
    CHART {
        uuid id PK
        string chartId UK
        uuid projectId FK
        uuid assignedCoderId FK "nullable, reserved for future assignment workflow"
        uuid assignedById FK "nullable"
        datetime assignedAt "nullable"
        datetime createdAt
    }
    PRODUCTION_ENTRY {
        uuid id PK
        uuid chartId FK
        uuid coderId FK
        int version
        boolean isCurrent
        int pageCount
        int totalDOS
        int totalICDs
        string status
        string remarks
        date codedDate
        datetime createdAt
        datetime updatedAt
    }
    AUDIT_ENTRY {
        uuid id PK
        uuid productionEntryId FK
        uuid chartId FK "denormalized for direct lookup"
        uuid auditorId FK
        int auditErrors
        int errorExceptions
        int totalErrors
        string status
        date auditDate
        string remarks
        datetime createdAt
        datetime updatedAt
    }
    NOTIFICATION {
        uuid id PK
        uuid userId FK
        string type
        string message
        boolean isRead
        datetime createdAt
    }
    ACTIVITY_LOG {
        uuid id PK
        uuid userId FK
        string action
        string entity
        string entityId
        datetime timestamp
    }
    AUDIT_LOG {
        uuid id PK
        uuid userId FK
        string role
        string action
        string entity
        string entityId
        jsonb before
        jsonb after
        string ip
        string userAgent
        datetime timestamp
    }
```

## Entity Notes

- **User / Role / UserRole**: unchanged from the original design — many-to-many even though v1 gives each user exactly one role, so the RBAC engine doesn't need a schema change if a future role needs to be composite.
- **Team / TeamMember**: unchanged.
- **Client / Project**: unchanged. A `Project` belongs to a `Client` and is assigned to a `Team`. Charts belong to a `Project`.
- **AuditorProjectAssignment** *(new)*: implements the approved Question 6 decision — an Auditor is scoped to one or more Projects; their queue is derived from this table, not from per-chart assignment.
- **Chart** *(updated)*: now carries `assignedCoderId`, `assignedById`, `assignedAt` — reserved per the approved Question 5 decision. These are nullable and unused by v1 business logic (v1 uses direct Coder entry, auto-creating the Chart), but exist so a future move to formal chart assignment is additive, not a migration.
- **ProductionEntry** *(updated — versioned)*: `chartId` is **no longer unique alone**. `(chartId, version)` is unique, and a partial unique index enforces exactly one `isCurrent = true` row per `chartId`. This is the schema change that makes rework (Question 2) possible without ever overwriting a coder's original submission. Coder identity is still always resolved via join to `User`, never stored redundantly.
- **AuditEntry** *(updated — 1:N against ProductionEntry)*: references `productionEntryId` (the specific version being audited) and denormalizes `chartId` for direct lookup convenience. Multiple `AuditEntry` rows can exist against the same `productionEntryId` over time (re-audit), but v1 business logic only permits a second row once the first's status is `REJECTED` — enforced in the service layer, not by a DB constraint, since the DB can't express "only if the prior row is in this state."
- **ActivityLog vs AuditLog**: unchanged — `ActivityLog` is the lightweight UI feed, `AuditLog` is the compliance-grade append-only log (no `DELETE` for any role).

## Indexes

| Table | Column(s) | Reason |
|---|---|---|
| `Chart` | `chartId` (unique) | Primary lookup key across the whole app |
| `Chart` | `assignedCoderId` | Future assignment queries (reserved) |
| `ProductionEntry` | `(chartId, version)` (unique) | Enforces one row per chart per version |
| `ProductionEntry` | `chartId` (partial unique, `WHERE isCurrent = true`) | Enforces exactly one current version per chart |
| `ProductionEntry` | `coderId` | Coder's own production list |
| `ProductionEntry` | `codedDate` | Date-range report filtering |
| `AuditEntry` | `productionEntryId` | Version-scoped audit lookup |
| `AuditEntry` | `chartId` | Direct chart-based audit lookup |
| `AuditEntry` | `auditorId` | Auditor's own audit list |
| `AuditEntry` | `auditDate` | Date-range report filtering |
| `AuditorProjectAssignment` | `(auditorId, projectId)` (unique) | Prevents duplicate assignment rows |
| `User` | `employeeId` (unique) | Identity lookup |
| `User` | `loginName` (unique) | Login lookup |

## Status Enums (finalized per `11-SCHEMA-DECISIONS.md`)

```
ProductionStatus: PENDING | IN_PROGRESS | COMPLETED | REWORK | CANCELLED
AuditStatus:      PENDING | IN_PROGRESS | COMPLETED | REVIEW_REQUIRED | REJECTED
```

These replace the earlier proposed (and now superseded) 4-value/4-value sets from the original draft of this document. Full transition rules and role-based permissions for each transition are in `09-BUSINESS-RULES.md`.
