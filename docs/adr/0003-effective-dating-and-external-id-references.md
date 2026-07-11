# ADR 0003: Effective-dating convention and external-id references

## Status
Accepted

## Context
INV-4 requires that every entity and relationship is effective-dated, that
nothing is destructively updated, and that every read is as-at a date. Two
conventions must be fixed and enforced, because ambiguity here is expensive to
unpick later (noted as a Sprint 2 failure mode).

## Decision

### Effective-dating convention
- Every entity and relationship row carries `valid_from` (inclusive) and
  `valid_to` (exclusive), both `timestamptz`.
- `valid_to IS NULL` denotes the currently-open version. NULL is the single
  sentinel for "open"; a far-future timestamp is not used.
- A read as-at date `D` returns rows where
  `valid_from <= D AND (valid_to IS NULL OR valid_to > D)`.
- A change never updates in place. It supersedes: the open row's `valid_to` is
  set to the effective instant, and a new row is inserted with `valid_from` at
  that instant and `valid_to` NULL. This is the only sanctioned write and lives
  in `supersession.ts`; a lint rule forbids raw `UPDATE` on entity tables
  elsewhere.
- At most one open version per logical entity, enforced by a partial unique
  index on `(workspace_id, external_id) WHERE valid_to IS NULL`.

### External-id references
- Entities reference one another by `external_id`, the stable client-supplied
  logical key, not by internal version `id`. A position references its cost
  centre by `cost_centre_external_id`.
- Rationale: internal ids identify a single version; references must survive
  supersession and resolve as-at a date. Referencing by version id would break
  every reference each time the referenced entity changed.

## Consequences
Reads are always scoped by an as-at date, defaulting to today, carried on the
`TenantContext`. The reporting line is modelled as its own effective-dated
relationship (`reporting_lines`), never as a column on a position or a person.
The closure table and every measure resolve against a date and a scenario.
