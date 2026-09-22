# 05 — Frontend Architecture

Next.js App Router, TypeScript, Tailwind + MUI, TanStack Query, Zustand, React Hook Form + Zod.

## Folder Structure

```
src/
  app/                        # route groups, one per role, see below
  components/
    ui/                       # design-system primitives (see 05a)
    forms/                    # composed form fields (ChartIdField, StatusSelect, etc.)
    tables/                   # DataTable wrapper + column configs
  features/
    auth/
    manager/
    team-lead/
    coder/
    auditor/
    users/
    teams/
    charts/
    production/
    audit/
    reports/
    notifications/
  hooks/                      # cross-feature hooks (useDebounce, usePagination)
  lib/                        # api client (axios/fetch wrapper), query keys, formatters
  services/                   # one file per API resource, thin wrapper over lib/api
  stores/                     # zustand: ui state only (sidebar open, active filters draft)
  schemas/                    # zod schemas — imported from packages/shared-types where shared with backend
  types/
  config/                     # role→route map, nav config, status enum labels
```

Each `features/<name>` module owns its own components, hooks, and query definitions for that domain — a feature never reaches into another feature's internals, only through its public `index.ts`.

## Route Structure (App Router, role-gated route groups)

```
app/
  login/page.tsx
  (manager)/
    layout.tsx                # guard: role !== MANAGER → redirect
    manager/page.tsx
    manager/team-leads/page.tsx
    manager/auditors/page.tsx
    manager/coders/page.tsx
    manager/teams/page.tsx
    manager/charts/page.tsx
    manager/production/page.tsx
    manager/audits/page.tsx
    manager/reports/page.tsx
    manager/analytics/page.tsx
  (team-lead)/
    layout.tsx                # guard: role !== TEAM_LEAD
    team-lead/page.tsx
    team-lead/coders/page.tsx
    team-lead/production/page.tsx
    team-lead/charts/page.tsx
    team-lead/productivity/page.tsx
    team-lead/reports/page.tsx
  (coder)/
    layout.tsx                # guard: role !== CODER
    coder/page.tsx
    coder/production/page.tsx
    coder/production/new/page.tsx
    coder/reports/page.tsx
  (auditor)/
    layout.tsx                # guard: role !== AUDITOR
    auditor/page.tsx
    auditor/queue/page.tsx
    auditor/audit-entry/page.tsx
    auditor/audits/page.tsx
    auditor/reports/page.tsx
```

The layout guard reads the role claim from the session (server component, reading the JWT from an httpOnly cookie) — a Coder requesting `/manager/reports` is redirected server-side before any manager data or component ever reaches the client bundle. This is defense-in-depth on top of the backend's own enforcement, not a substitute for it.

## State Strategy

- **TanStack Query** owns all server state: production lists, audit lists, user lists, reports. Query keys are structured `[resource, scope, filters]` so cache invalidation after a mutation (e.g., creating a Production entry invalidates `['production', 'own']` and the dashboard's summary query) is precise.
- **Zustand** is limited to genuinely client-only state: sidebar collapsed/expanded, an in-progress filter draft before it's applied, active tab in a multi-tab view. It does not hold anything that's also fetched from the server — that would create a second source of truth.
- **React Hook Form + Zod** owns all form state. The Zod schema for a Production entry or Audit entry is the same schema (via `packages/shared-types`) the backend DTO validates against, so a validation error message on the frontend and the backend's rejection reason are guaranteed to agree.

## Design System

See `05a` below for the component list; key point: **no component invents its own spacing/color values** — everything reads from CSS variables defined once (see Section 14 of your brief — tokens, not hardcoded hex).

Reusable components: Button, Input, Select, DatePicker, DataTable, StatusBadge, Modal, Drawer, Toast, Alert, ConfirmDialog, MetricCard, PageHeader, Breadcrumb, Tabs, Pagination, FilterBar, EmptyState, LoadingState, ErrorState, FormSection.

`StatusBadge` reads its color/label mapping from the canonical status enum in `config/` (see `02-DATABASE-DESIGN.md`'s open question on enum values) — one source of truth, not a badge-by-badge color choice.

## What this explicitly avoids

Per Section 23 of your brief: no page in this architecture reads from `localStorage` as a data source, no screen ships with hardcoded/fake production numbers, and every list/table in the design is backed by a TanStack Query call to a real endpoint from day one of that feature's implementation — there is no "fake frontend first, wire it up later" phase.
