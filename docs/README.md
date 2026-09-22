# SmartCode — Architecture & Planning Package

**Company:** SmartClues Technologies LLP
**Product:** SmartCode — Medical Coding Production, Audit and Consolidation Platform
**Status:** Planning phase — no application code has been implemented yet. Schema-shaping decisions (`11-SCHEMA-DECISIONS.md`) are approved and have been propagated into the documents below. Still awaiting final go-ahead to begin Phase 1.

## How to read this package

| Doc | Contents |
|---|---|
| [01-PRODUCT-ARCHITECTURE.md](./01-PRODUCT-ARCHITECTURE.md) | Purpose, roles, hierarchy, core workflow, modules, system boundaries |
| [02-DATABASE-DESIGN.md](./02-DATABASE-DESIGN.md) | ERD, entity notes, indexes, status enums *(updated: versioned Production, 1:N Audit)* |
| [03-RBAC-PERMISSIONS.md](./03-RBAC-PERMISSIONS.md) | Full permission matrix, hierarchy enforcement rules *(updated: rework/re-audit rows)* |
| [04-API-ARCHITECTURE.md](./04-API-ARCHITECTURE.md) | Every endpoint, by module, with caller/authz notes *(updated: rework, re-audit, auditor-assignment endpoints)* |
| [05-FRONTEND-ARCHITECTURE.md](./05-FRONTEND-ARCHITECTURE.md) | Folder structure, routes, state strategy, design system |
| [06-BACKEND-ARCHITECTURE.md](./06-BACKEND-ARCHITECTURE.md) | Module structure, auth provider abstraction, request lifecycle, jobs |
| [07-SECURITY-ARCHITECTURE.md](./07-SECURITY-ARCHITECTURE.md) | Auth, authz, session, secrets, headers, logging |
| [08-DEPLOYMENT-ARCHITECTURE.md](./08-DEPLOYMENT-ARCHITECTURE.md) | Docker Compose (local) and target AWS architecture |
| [09-BUSINESS-RULES.md](./09-BUSINESS-RULES.md) | The rules of the domain, stated plainly, JCD explicitly excluded *(updated: rework, re-audit, chart/auditor assignment rules)* |
| [10-IMPLEMENTATION-ROADMAP.md](./10-IMPLEMENTATION-ROADMAP.md) | Testing strategy, phased plan, assumptions, open questions *(updated: 4 of 7 open questions resolved)* |
| [11-SCHEMA-DECISIONS.md](./11-SCHEMA-DECISIONS.md) | The 7 schema-shaping decisions — approved, source of truth for the updates above |

## Key constraints carried through every document

- **No JCD** anywhere — not in the schema, API, UI, reports, calculations, tests, or seed data.
- Chart ID is the single linking key between Production and Audit.
- Coder and Auditor identity fields are always derived from the authenticated session, never manually entered.
- Total Number of Errors is always calculated and validated server-side.
- Backend enforcement of every RBAC/hierarchy rule is independent of frontend enforcement — the frontend hides what a role can't do, the backend rejects it regardless.

## Before Phase 1 starts

The four schema-shaping questions (chart lifecycle, production edit/rework, audit relationship, audit status) are resolved and approved via `11-SCHEMA-DECISIONS.md`, and that decision has been propagated into `02`, `03`, `04`, `09`, and `10`. Two open items remain — CPH hour-capture method and frontend hosting choice — neither blocks the start of Phase 1 or Phase 2.

**No implementation begins until you give explicit go-ahead to start Phase 1.**
