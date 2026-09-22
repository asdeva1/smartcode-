# 03 — RBAC & Permissions

**Updated per `11-SCHEMA-DECISIONS.md` (approved)** — three permission rows added for rework/re-audit/cancellation; everything else in the original matrix is unchanged.

## Enforcement Model

Two layers, both mandatory:

1. **Coarse (route-level)**: NestJS `@Roles(Role.MANAGER)` decorator + `RolesGuard` on every controller method. Rejects wrong-role requests with `403` before any handler logic runs.
2. **Fine (row-level, in the service layer)**: because "TL can view team production" or "Coder can edit own production" depend on *which* team/record, not just the role, every service method that reads/writes scoped data re-derives the caller's scope from the JWT (`userId`, `role`, `teamId`) and filters the query accordingly — it does not trust a client-supplied `teamId` or `coderId` in the request body/query for authorization decisions.

## Permission Matrix

| Permission | Manager | Team Lead | Coder | Auditor |
|---|:---:|:---:|:---:|:---:|
| Create User (TL) | ✅ | ❌ | ❌ | ❌ |
| Create User (Auditor) | ✅ | ❌ | ❌ | ❌ |
| Create User (Coder) | ❌ | ✅ (own team) | ❌ | ❌ |
| View User | ✅ (all) | ✅ (own team) | ✅ (self) | ✅ (self) |
| Edit User | ✅ (all) | ✅ (own team, limited fields) | ✅ (self, limited fields) | ✅ (self, limited fields) |
| Activate User | ✅ (TL, Auditor) | ✅ (own Coders) | ❌ | ❌ |
| Deactivate User | ✅ (TL, Auditor) | ✅ (own Coders) | ❌ | ❌ |
| Manage Teams | ✅ | ❌ | ❌ | ❌ |
| Manage Assignments (TL↔Team, Auditor↔Project) | ✅ | ❌ | ❌ | ❌ |
| Create Production | ❌ | ❌ | ✅ (own) | ❌ |
| View Production | ✅ (all) | ✅ (own team) | ✅ (own) | ✅ (via Chart ID fetch, read-only) |
| Edit Production | ❌ | ❌ | ✅ (own, status-gated) | ❌ |
| Create Audit | ❌ | ❌ | ❌ | ✅ (own) |
| View Audit | ✅ (all) | ✅ (own team's charts) | ❌ | ✅ (own) |
| Edit Audit | ❌ | ❌ | ❌ | ✅ (own, status-gated) |
| View Reports | ✅ (all) | ✅ (team-scoped) | ✅ (self-scoped) | ✅ (self-scoped) |
| Export Reports | ✅ | ✅ (team-scoped) | ✅ (self-scoped) | ✅ (self-scoped) |
| View Activity Logs | ✅ | ✅ (own team) | ✅ (self) | ✅ (self) |
| View Audit Logs (compliance log) | ✅ | ❌ | ❌ | ❌ |
| Delete Audit Logs | ❌ | ❌ | ❌ | ❌ |
| Initiate Rework (`COMPLETED → REWORK`) | ✅ | ✅ (own team) | ✅ (own record) | ❌ |
| Resolve `REVIEW_REQUIRED` audit | ✅ | ✅ (own team's charts) | ❌ | ❌ |
| Cancel Production/Chart | ✅ | ✅ (own team) | ❌ | ❌ |

## Hierarchy Enforcement (creation rules)

Validated server-side in the `UsersService.create()` method before any insert:

```
requestingUser.role === MANAGER   → target role must be TEAM_LEAD or AUDITOR
requestingUser.role === TEAM_LEAD → target role must be CODER, and the new Coder
                                     is auto-assigned to the requesting TL's team
requestingUser.role === CODER     → reject, 403
requestingUser.role === AUDITOR   → reject, 403
```

Any other combination (TL creating another TL, TL creating an Auditor, Manager creating a Coder directly, etc.) is rejected with a `403` and logged to `AuditLog` as a denied action — a repeated pattern of denied creation attempts is a useful security signal, so these are logged even though they failed.

## Identity Auto-Fill (not strictly RBAC, but adjacent)

Both Production and Audit forms derive identity fields from the JWT's `sub`/`userId` claim server-side — `coderId`/`auditorId` on the entity is set from the authenticated session, never accepted as a client-writable field, even if the frontend form were somehow tampered with to include it. This closes the risk of one coder submitting production under another coder's identity.
