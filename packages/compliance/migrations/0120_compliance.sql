-- Sprints 22-25 (core): enterprise data protection. Subject access requests,
-- erasure with referential integrity, and retention. Built against synthetic
-- data. Every action is audited through the existing trigger, and erasure is
-- certificated.

-- Retention policy per data classification: how long a superseded version is
-- retained before it is a candidate for purge.
CREATE TABLE retention_policies (
  tenant_id      uuid NOT NULL,
  workspace_id   uuid NOT NULL,
  classification text NOT NULL,
  retain_years   numeric(5,2) NOT NULL,
  PRIMARY KEY (workspace_id, classification)
);
SELECT wfb_apply_tenancy('retention_policies');

-- A certificate that a subject's personal data was erased, retained as evidence
-- of compliance. The subject identifier is retained deliberately (it is the key
-- to prove erasure occurred), but the personal data it referenced is gone.
CREATE TABLE erasure_certificates (
  tenant_id            uuid NOT NULL,
  workspace_id         uuid NOT NULL,
  subject_external_id  text NOT NULL,
  erased_at            timestamptz NOT NULL DEFAULT now(),
  certificate          text NOT NULL,
  PRIMARY KEY (workspace_id, subject_external_id)
);
SELECT wfb_apply_tenancy('erasure_certificates');
