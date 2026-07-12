# Workforce Blueprint

A multi-tenant SaaS platform for organisation design, workforce planning,
workforce cost modelling, and job and skills architecture.

The governing documents are the constitution of the project. Read them before
changing anything:

- [`CLAUDE.md`](./CLAUDE.md) - the constitution, the five primitives, the fixed
  technical decisions, the domain model, the stop conditions.
- [`docs/invariants.md`](./docs/invariants.md) - the eleven machine-checked
  invariants, each with the test that proves it.
- [`docs/build-protocol.md`](./docs/build-protocol.md) - how to work.
- [`docs/sprint-prompts.md`](./docs/sprint-prompts.md) - the build script.
- [`docs/adr/`](./docs/adr) - architecture decision records.

## Getting started

Requirements: Node 22+, pnpm 10+, PostgreSQL 16.

```bash
pnpm install
pnpm build
bash scripts/verify.sh     # the verification gate: types, lint, tests, scans
```

`scripts/verify.sh` self-heals a local PostgreSQL cluster on localhost:5432 for
local and web sessions. In CI a postgres service container is used instead.

## Repository structure

See `CLAUDE.md` section 6. In short: `apps/` (web, api, worker, render),
`packages/` (the primitives and libraries), `scripts/`, `docs/`, `tests/`.

## The verification gate

`scripts/verify.sh` runs, in order: strict type check, lint including the
architectural rules that encode the invariants, schema invariant tests, unit and
integration tests, cross-tenant isolation, scenario isolation, measure
consistency, the adversarial AI suite, the performance suite (on demand), and a
secret and personal-data scan. A failure at any gate is a build failure.

## Status

Foundations built in dependency order. See the handoff report in the pull
request and `docs/adr/` for what exists and why.
