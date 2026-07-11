# ADR 0002: Forced row-level security with session-derived context

## Status
Accepted

## Context
INV-1 and INV-2 require that cross-tenant leakage is structurally impossible.
Row-level security that is enabled but not forced is bypassed by the table
owner, rendering the control decorative. Tenant context read from a request
parameter puts every endpoint one authorisation bug away from a breach.

## Decision
- Every customer-data table has row-level security ENABLED and FORCED. The
  application connects as a NON-superuser role (`wfb_app`) with no BYPASSRLS, so
  policies always apply to it.
- Policies derive the tenant and workspace from PostgreSQL session settings
  (`app.current_tenant`, `app.current_workspace`) read with the missing_ok form
  of `current_setting`. When unset, the predicate is NULL and zero rows are
  returned. This is the fail-closed guarantee.
- Those session settings are applied only inside `runInTenant`, from a
  `TenantContext` that is constructed exclusively in authentication middleware
  from the verified session. A lint rule (`wfb/no-tenant-from-request`) forbids
  reading tenant or workspace identity from the request object elsewhere.
- Tenancy is applied through the SQL helpers `wfb_apply_tenancy` (full tenancy)
  and `wfb_apply_tenant_scope` (tenant-scoped system tables), so it cannot be
  applied inconsistently.
- Migrations run as the administrative role; feature code never uses it. A grant
  sweep gives the application role table access, which remains subject to RLS.

## Consequences
Isolation is proven by two tests that run as the real application role against
real policies: a schema enumeration (INV-1) and a cross-tenant suite (INV-2).
Tenant and workspace provisioning is a control-plane operation on the admin
connection, mirroring production. Adding a table without tenancy fails the
schema test loudly.
