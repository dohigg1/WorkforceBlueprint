-- E06-01: measure cache with subtree-level invalidation (INV-6, INV-9).
-- A scope-aggregate measure result is cached by (scenario, measure, scope). A
-- structural edit invalidates only the cache entries whose scope could have
-- changed: the edited node's ancestor subtrees and any organisation-wide scope.
-- This is what keeps recompute after an edit under two seconds at 100k, rather
-- than recomputing the whole dataset.

CREATE TABLE measure_cache (
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  scenario_id   uuid NOT NULL,
  measure_key   text NOT NULL,
  scope_type    text NOT NULL,
  scope_anchor  text NOT NULL DEFAULT '',
  as_at         date NOT NULL,
  value         double precision NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, scenario_id, measure_key, scope_type, scope_anchor, as_at)
);
SELECT wfb_apply_tenancy('measure_cache');
