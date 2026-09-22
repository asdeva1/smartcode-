# 07 — Security Architecture

## Authentication

- v1: native NestJS auth — passwords hashed with **argon2id** (preferred over bcrypt for new systems; bcrypt acceptable if the team has existing tooling around it), JWT access tokens (short-lived, ~15 min) + refresh tokens (httpOnly, secure, `SameSite=strict` cookie, ~7 days, rotated on use).
- Architecture is Keycloak-ready: `AuthProvider` interface (see `06-BACKEND-ARCHITECTURE.md`) isolates the auth mechanism from everything else. `User.externalId` and `User.authProvider` columns are reserved from day one so a future Keycloak migration doesn't require a user-table migration, just a data backfill.
- Failed logins are tracked per account (`failedLoginCount`, `lockedUntil` on `User` or a companion table) and trigger temporary lockout after a threshold, plus a `LOGIN_FAILED` audit log entry with IP and user agent.

## Authorization

RBAC as detailed in `03-RBAC-PERMISSIONS.md` — enforced at both route level (guards) and row level (service-layer scoping). No endpoint relies on the frontend to have hidden a button; every mutating and every scoped-read endpoint independently re-checks.

## Session Management

- Access token: memory or short-lived cookie, never `localStorage` (XSS-exposed).
- Refresh token: httpOnly cookie, inaccessible to JS.
- Logout invalidates the refresh token server-side (Redis blocklist keyed by token ID) — not just a client-side cookie clear.

## Rate Limiting

`@nestjs/throttler` (or equivalent), applied globally with a tighter limit specifically on `/api/auth/login` (e.g., 5 attempts / minute / IP) to blunt credential-stuffing attempts, independent of the account-lockout mechanism above.

## Input Validation

Every request body/query/param validated via DTO (`class-validator`) before it reaches a service. Zod schemas mirror these on the frontend for immediate UX feedback, but the backend validation is authoritative and non-bypassable.

## Audit Logging

Every action in the list below writes an `AuditLog` row (timestamp, user, role, action, entity, entityId, before/after JSON, IP, user agent):

```
LOGIN, LOGOUT, LOGIN_FAILED,
USER_CREATED, USER_UPDATED, USER_ACTIVATED, USER_DEACTIVATED,
PRODUCTION_CREATED, PRODUCTION_UPDATED,
AUDIT_CREATED, AUDIT_UPDATED,
REPORT_EXPORTED
```

Written via a Nest interceptor so individual services don't need to remember to log — it's structural, not opt-in per handler. No role, including Manager, can delete an `AuditLog` row through the application; there is no `DELETE` endpoint for this resource.

## Secrets Management

- Never committed. `.env.example` documents required variable *names* with placeholder/dummy values only.
- Local dev: `.env` (gitignored).
- Production (AWS): AWS Secrets Manager, injected into ECS task definitions as environment variables at deploy time — the application code reads `process.env.X` either way, so there's no code-level difference between local and production secret sourcing.

## Transport & Headers

- HTTPS enforced everywhere in production (TLS terminated at ALB in the AWS target architecture).
- `helmet` middleware for standard security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP).
- CORS restricted to the known frontend origin(s), credentials allowed only for that origin.

## Injection & XSS Protection

- SQL injection: mitigated structurally by Prisma's parameterized queries — no raw string-concatenated SQL anywhere in the codebase (enforced by code review / lint rule against `$queryRawUnsafe`).
- XSS: React's default escaping + no `dangerouslySetInnerHTML` usage for user-supplied content (Remarks fields, etc.); CSP as a second layer.

## CSRF Considerations

Since auth uses `SameSite=strict` httpOnly cookies for the refresh token and the access token is sent via `Authorization` header (not a readable-by-form cookie), classic CSRF (which relies on browsers auto-attaching cookies to cross-site form submissions) has limited surface here. If a cookie-based access token is used instead in a future iteration, a CSRF token should be added at that point.

## Data Access Boundaries

Row-level scoping (detailed in `03-RBAC-PERMISSIONS.md`) is the primary boundary preventing, e.g., one TL's team data leaking into another TL's report view. This is implemented as a mandatory `WHERE` clause injected by the service layer based on the JWT claims — never as an optional filter the client can omit to "see more."
