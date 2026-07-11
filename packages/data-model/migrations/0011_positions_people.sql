-- E02-01: Positions and People. The most important rule in the model: the
-- hierarchy is a hierarchy of Positions, not of People. A Position is a seat
-- that exists whether or not anyone occupies it; a vacant Position still has a
-- grade, a cost centre, a location and a place in the structure. A Person
-- occupies zero, one or many Positions, with fractional apportionment.
--
-- Entities reference one another by external_id, the stable client-supplied
-- logical key, not by internal version id, so that references survive
-- supersession and resolve as-at a date (ADR 0003).

CREATE TABLE positions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  workspace_id           uuid NOT NULL,
  external_id            text NOT NULL,
  title                  text NOT NULL,
  grade                  text,
  fte                    numeric(6,3) NOT NULL DEFAULT 1.0,
  status                 text NOT NULL DEFAULT 'active',
  cost_centre_external_id text,
  location_external_id   text,
  org_unit_external_id   text,
  job_external_id        text,
  role_external_id       text,
  custom                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from             timestamptz NOT NULL DEFAULT current_date,
  valid_to               timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positions_fte_positive CHECK (fte > 0)
);
SELECT wfb_apply_entity('positions');

-- A Person is an individual. Names and emails are personal data, classified in
-- the field classification registry (INV-7). The Person table NEVER carries a
-- manager reference; reporting is a relationship between Positions.
CREATE TABLE people (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  external_id   text NOT NULL,
  display_name  text NOT NULL,
  email         text,
  custom        jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from    timestamptz NOT NULL DEFAULT current_date,
  valid_to      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('people');
