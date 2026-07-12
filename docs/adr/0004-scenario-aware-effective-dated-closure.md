# ADR 0004: Scenario-aware, effective-dated position closure

## Status
Accepted

## Context
INV-9 requires an ancestor or descendant subtree query under 100 milliseconds on
a 100,000-node dataset. Recursive traversal of the reporting graph on every read
cannot meet that. INV-6 and the scenario primitive require that the hierarchy is
resolvable per scenario and as-at a date. Naively materialising a full closure
per scenario per date does not scale and is the stated failure mode of Sprint 3.

## Decision
- We materialise a closure table `position_closure` with columns
  `(tenant_id, workspace_id, scenario_id, ancestor_external_id,
  descendant_external_id, depth)`. Every node has a self-row at depth 0. The
  closure is the hot read path; reads never traverse recursively.
- `scenario_id` keys the closure by scenario. The baseline is the all-zero
  sentinel `00000000-0000-0000-0000-000000000000`. The table is therefore
  scenario-ready from the first migration: adding a scenario adds closure rows
  under its id, it does not require a schema change.
- The closure is MAINTAINED by recursive common table expression, which is
  permitted for maintenance and forbidden on hot reads. Maintenance is a
  cycle-safe traversal capped at a maximum depth, because ingested data may
  contain cycles (the synthetic dataset injects one deliberately). Cycle-safe
  maintenance flags rather than crashes on a pre-existing cycle.
- The effective structure is resolved through one seam,
  `wfb_effective_reporting_edges(scenario)`, which returns `(child, parent)` for
  the reporting graph of a scenario as-at the caller's date. For the baseline it
  returns the currently-open reporting lines. The scenarios package extends this
  seam to overlay a scenario's deltas; nothing else changes.
- Cycle detection is a WRITE-time constraint. The sanctioned write helper
  `setReportingLine` rejects a change whose new parent is already a descendant of
  the child, using the materialised closure. Orphans and multiple roots are
  permitted and flagged, never blocked, because real client data contains them.
- Effective dating: the materialised closure represents the current (open)
  structure of a scenario, serving the hot path. A read as-at a historical date
  is resolved by the same cycle-safe traversal over the reporting lines live at
  that date; this cold path favours correctness over latency, and the 100ms
  target applies to the current-structure hot path it is measured against.

## Consequences
Subtree, ancestor, descendant, depth, height and layer queries are indexed
lookups against `position_closure`, meeting the 100ms target. The closure is
rebuilt transactionally when the structure changes. The scenario seam means the
scenario engine (Sprint 8) overlays deltas without reworking the hierarchy.
