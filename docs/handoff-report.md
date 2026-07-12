# Handoff report

## Release 1 status (current)

The full Release 1 surface is built and verified against a live PostgreSQL 16
database: tenancy, canonical model, hierarchy, audit, scenario overlay, measure
engine, cost model, ingestion, a NestJS API, a React web application with the
editing surface, a semantic tool layer (natural language), and board-pack export.
`scripts/verify.sh` is green: 98 tests plus 3 performance tests at 100k.

Packages: tenancy, data-model, audit, hierarchy, scenarios, measures, costing,
ingestion, ai, render. Apps: api (NestJS), web (React + Vite + TanStack Query).

The web application was verified end to end with Playwright: dev login, the
canvas organisation chart, per-node measures and the transparent cost build-up,
scenario creation and comparison, the reparenting edit (E07-02) through the
scenario engine, and the ingestion mapping and validation view, all with zero
console errors.

Still planned (Release 2 and 3): job and role architecture, skills taxonomy,
strategic workforce planning, severance and cost-out, the partner console,
connectors, and enterprise compliance. AI model wiring uses a deterministic
planner behind the constrained tool schema; a live Anthropic-backed planner
slots in behind the same validated schema when a key is provided.

---

# Handoff report: foundation build

This build established the load-bearing primitives in dependency order, each
verified against a live PostgreSQL 16 database with real row-level security. It
covers Sprint 0 (the verification gate and synthetic data), Sprint 1 (tenancy),
Sprint 2 (the canonical model), Sprint 3 (hierarchy and audit), the scenario
overlay primitive (E07-01), and the measure engine (Sprint 6).

## What was built

### Sprint 0: the verification gate and synthetic data
- pnpm monorepo per CLAUDE.md section 6. Strict TypeScript throughout.
- `scripts/verify.sh`: the ten-gate pipeline (types, lint, schema invariants,
  unit and integration, cross-tenant, scenario, measure, adversarial,
  performance, secret and PII scan). Gates with no code yet pass trivially.
- Architectural lint rules encoding INV-2, INV-4, INV-5, INV-6, INV-8.
- GitHub Actions running verify on every push. Pre-commit PII scan.
- Self-healing local PostgreSQL for local and web sessions; a service container
  in CI.
- `scripts/seed-synthetic.ts`: 100k positions in about 11 seconds, realistic
  shape, deliberate defects (orphans, duplicate identifiers, one cycle). All
  data synthetic.

### Sprint 1: tenancy (E01-01, E01-02, E01-06)
- Tenants, workspaces, users, memberships, invitations, sessions.
- Row-level security ENABLED and FORCED on every table, failing closed. The
  application connects as a non-superuser role subject to the policies.
- Tenant context derived only from the session, applied via `runInTenant`.
- INV-1 schema test enumerates every table and proves isolation. INV-2
  cross-tenant suite proves not-found, not forbidden.

### Sprint 2: the canonical model (E02-01, E02-02, E02-05)
- Positions and People as distinct entities. The hierarchy is a hierarchy of
  positions; the reporting line is a separate effective-dated relationship.
- Reference entities: locations, cost centres, org units, job families, jobs,
  roles, skills, activities.
- Effective dating on every entity and relationship; supersession helper is the
  only sanctioned update; as-at reads default to today.
- Field classification registry: every customer column classified with a
  default permission and masking behaviour; masking returns a masked value.

### Sprint 3: hierarchy and audit (E02-03, E02-04, E03-01)
- Materialised closure table, scenario-keyed and cycle-safe. Traversal readers
  only; span and layers are measures.
- Write-time cycle detection. Orphans and multiple roots permitted.
- Append-only audit log via trigger, same transaction, immutable, unbypassable.

### Scenario overlay (E07-01)
- Copy-on-write deltas resolved at read time. Creating a scenario is a single
  insert. Baseline provably untouched by scenario edits.
- The closure seams resolve through the overlay, so the closure of any scenario
  reflects its deltas.

### Measure engine (Sprint 6: E06-01, E06-02)
- One declarative engine over scope, scenario and date. All aggregate SQL is
  confined to this package.
- Standard library available on load. Scenario-aware. Cached with subtree-level
  invalidation.

## Performance (INV-9, measured on the synthetic 100k dataset)

| Operation | Target | Measured |
|---|---|---|
| Descendant subtree query at 100k | under 100 ms | 23.5 ms |
| Ancestor query at 100k | under 100 ms | 0.3 ms |
| Measure recompute after edit | under 2 s | 0.6 s |
| Full closure rebuild at 100k (maintenance, not a read target) | none | ~17 to 30 s |
| Synthetic seed of 100k positions | none | ~16 s |

All read targets are met with margin. The full closure rebuild is a maintenance
operation, not a measured read target; the materialised closure serves the reads
that are measured.

## What was NOT built (explicit)

- **No front end.** apps/web, apps/api, apps/worker and apps/render are scaffold
  directories only. There is no HTTP layer, no React chart, no export service.
  The engines are built and tested at the package and database level.
- **No ingestion (Sprints 4 to 5).** Upload, AI-assisted mapping, fuzzy
  matching, validation and remediation are not built. The synthetic generator
  and the defective dataset exist to test them later.
- **No editing surface (E07-02).** Drag and drop, bulk edit, undo and redo are a
  front-end concern on top of the scenario engine, not built.
- **No costing, planning, skills, or AI packages.** Sprints 9 onward.
- **Scenario-resolved historical closure** is the current-structure hot path;
  cold historical as-at traversal is described in ADR 0004 but the materialised
  closure targets the current structure.
- **Read-access logging** for severance and selection data (INV-3 additional
  rule) is a later story (Sprint 16).

## Assumptions

1. Effective dates are calendar-day granular (ADR 0003); supersession on the
   same day as a version's start is a correction, not a new version.
2. Tenant, workspace and user provisioning is a control-plane operation on the
   administrative connection, mirroring production.
3. The synthetic salary lives in positions.custom until the costing sprint adds
   a first-class cost model.
4. pgvector is not installed in this environment; it is only needed for the
   skills and AI sprints and does not affect the foundation.
