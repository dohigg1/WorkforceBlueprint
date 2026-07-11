-- INV-7: every field is classified, with a declared default access permission
-- and a declared masking behaviour. A user lacking permission receives a masked
-- value, not an error, so that aggregates over restricted data still resolve.
--
-- This registry is a global reference table (no customer data) and is therefore
-- allowlisted from tenancy in the INV-1 schema test. Its completeness is proven
-- by the INV-7 test: every column of every customer-data table must appear
-- here, or the build fails.

CREATE TABLE field_classifications (
  table_name         text NOT NULL,
  column_name        text NOT NULL,
  classification     text NOT NULL CHECK (classification IN
                       ('structural','financial','personal','sensitive_personal','special_category')),
  default_permission text NOT NULL DEFAULT 'read',
  masking            text NOT NULL DEFAULT 'none' CHECK (masking IN
                       ('none','redact','hash','aggregate_only','suppress_small_group')),
  PRIMARY KEY (table_name, column_name)
);

-- Seed every current column of the customer-data tables as structural by
-- default, then override the columns that carry financial or personal data.
-- Later migrations that add customer columns must add their classifications
-- too; the INV-7 test enforces it.
INSERT INTO field_classifications (table_name, column_name, classification)
SELECT c.table_name, c.column_name, 'structural'
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'positions','people','occupancies','reporting_lines',
    'locations','cost_centres','org_units','job_families','jobs','roles',
    'skills','activities'
  )
ON CONFLICT DO NOTHING;

-- Personal data: names and emails are personal and masked by redaction when the
-- caller lacks permission.
UPDATE field_classifications SET classification='personal', default_permission='pii:read', masking='redact'
  WHERE (table_name, column_name) IN (VALUES ('people','display_name'), ('people','email'));

-- Custom JSONB may contain arbitrary client properties; treat as personal by
-- default and redact, because we cannot assert its contents are structural.
UPDATE field_classifications SET classification='personal', default_permission='pii:read', masking='redact'
  WHERE column_name = 'custom'
    AND table_name IN ('people','occupancies');
