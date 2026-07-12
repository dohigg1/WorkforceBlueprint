# ADR 0005: One measure engine, scenario-aware

## Status
Accepted

## Context
INV-6 requires that every analytic in the product is a declarative measure
produced by one engine, with no bespoke aggregation queries in feature code. The
stated failure mode is span of control implemented as a hand-written query,
which forces every later module to invent its own arithmetic and guarantees that
two screens disagree about the same number. Workforce planning, the largest
epic, must require no new calculation infrastructure if this engine is right.

## Decision
- A measure is a declarative definition: an aggregation over a scope, in a
  scenario, as-at a date. Scopes are node, subtree, org-unit and whole
  organisation. The engine evaluates any measure against any scope without
  bespoke code.
- All aggregate SQL lives in `packages/measures` and nowhere else, enforced by
  the lint rule `wfb/no-aggregate-sql-outside-measures`. The hierarchy package
  deliberately exposes only traversal; span, layers and headcount are measures.
- The engine is scenario-aware from the first line. Scope resolution and every
  measure read through the scenario overlay (`wfb_resolve_entity`) and the
  scenario-keyed closure, so a measure evaluated in a scenario reflects that
  scenario's deltas while the baseline is unchanged. This is what stops the
  chart and the numbers disagreeing.
- Standard library, available on data load with no configuration: headcount,
  full-time equivalent, vacancies, filled headcount, average span of control,
  management ratio, layers (scope-aggregate); span of control, direct reports,
  total descendants, layer index (depth) and height (per-node).
- Scope-aggregate results are cached by scenario, measure, scope and date. A
  structural edit invalidates only the affected subtree: the edited node, its
  ancestor subtrees and any organisation-wide scope. This keeps recompute
  bounded rather than recomputing the whole dataset.

## Consequences
Adding an analytic is adding a definition, not a feature. Supply, demand and gap
in workforce planning become time-series measures over the same graph with no
new engine. The consistency test proves that a measure evaluated through two
surfaces returns identical values. Every parameter is referenced in the
generated SQL so the planner types them; the query is fully parameterised, so
record content can never alter it.
