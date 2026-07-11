-- E11: job and role architecture, and the skills taxonomy. A Role is a cluster
-- of similar Positions; a JobFamily groups Roles (both already exist as
-- entities). These relationships are effective-dated, exactly as the reporting
-- line is: role membership and required skills change over time.

-- Which positions belong to a role (the role architecture).
CREATE TABLE role_positions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  workspace_id          uuid NOT NULL,
  external_id           text NOT NULL,
  role_external_id      text NOT NULL,
  position_external_id  text NOT NULL,
  custom                jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from            timestamptz NOT NULL DEFAULT current_date,
  valid_to              timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('role_positions');
CREATE INDEX role_positions_role_idx ON role_positions (workspace_id, role_external_id);
CREATE INDEX role_positions_pos_idx ON role_positions (workspace_id, position_external_id);

-- Skills a position requires, with an importance weight.
CREATE TABLE position_skills (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  workspace_id          uuid NOT NULL,
  external_id           text NOT NULL,
  position_external_id  text NOT NULL,
  skill_external_id     text NOT NULL,
  importance            numeric(4,2) NOT NULL DEFAULT 1.0,
  custom                jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from            timestamptz NOT NULL DEFAULT current_date,
  valid_to              timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('position_skills');
CREATE INDEX position_skills_pos_idx ON position_skills (workspace_id, position_external_id);

-- Skills a person holds, with a proficiency level.
CREATE TABLE person_skills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  workspace_id        uuid NOT NULL,
  external_id         text NOT NULL,
  person_external_id  text NOT NULL,
  skill_external_id   text NOT NULL,
  proficiency         numeric(4,2) NOT NULL DEFAULT 1.0,
  custom              jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from          timestamptz NOT NULL DEFAULT current_date,
  valid_to            timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
SELECT wfb_apply_entity('person_skills');
CREATE INDEX person_skills_person_idx ON person_skills (workspace_id, person_external_id);

-- Crosswalk of a skill to an external taxonomy (ESCO, O*NET, SFIA). Reference
-- configuration, tenant-scoped.
CREATE TABLE skill_crosswalks (
  tenant_id          uuid NOT NULL,
  workspace_id       uuid NOT NULL,
  skill_external_id  text NOT NULL,
  taxonomy           text NOT NULL,
  code               text NOT NULL,
  PRIMARY KEY (workspace_id, skill_external_id, taxonomy)
);
SELECT wfb_apply_tenancy('skill_crosswalks');

-- Classify the new customer columns (INV-7). Structural except the person link.
INSERT INTO field_classifications (table_name, column_name, classification)
SELECT c.table_name, c.column_name, 'structural'
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('role_positions', 'position_skills', 'person_skills')
ON CONFLICT DO NOTHING;

UPDATE field_classifications SET classification='personal', default_permission='pii:read', masking='redact'
  WHERE table_name='person_skills' AND column_name IN ('person_external_id', 'custom');
