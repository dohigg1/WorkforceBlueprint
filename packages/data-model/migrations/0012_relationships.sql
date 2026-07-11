-- E02-02: Relationships. Relationships are effective-dated exactly as entities
-- are (INV-4). The reporting line is a relationship, not a column, because it
-- is precisely the thing that changes over time.

-- The reporting hierarchy: a child position reports to a parent position. A
-- NULL parent denotes a root. This relationship is the sole source of the
-- position hierarchy; the closure table (packages/hierarchy) is derived from
-- it. It is distinct from org-unit membership.
CREATE TABLE reporting_lines (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  workspace_id              uuid NOT NULL,
  external_id               text NOT NULL,
  child_position_external_id  text NOT NULL,
  parent_position_external_id text,
  custom                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from                timestamptz NOT NULL DEFAULT current_date,
  valid_to                  timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('reporting_lines');
CREATE INDEX reporting_lines_child_idx ON reporting_lines (workspace_id, child_position_external_id);
CREATE INDEX reporting_lines_parent_idx ON reporting_lines (workspace_id, parent_position_external_id);

-- Occupancy: a person occupies a position with fractional full-time-equivalent
-- apportionment. Zero occupancies for a position means it is vacant.
CREATE TABLE occupancies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  workspace_id          uuid NOT NULL,
  external_id           text NOT NULL,
  person_external_id    text NOT NULL,
  position_external_id  text NOT NULL,
  fte                   numeric(6,3) NOT NULL DEFAULT 1.0,
  custom                jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from            timestamptz NOT NULL DEFAULT current_date,
  valid_to              timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT occupancies_fte_positive CHECK (fte > 0)
);
SELECT wfb_apply_entity('occupancies');
CREATE INDEX occupancies_position_idx ON occupancies (workspace_id, position_external_id);
CREATE INDEX occupancies_person_idx ON occupancies (workspace_id, person_external_id);
