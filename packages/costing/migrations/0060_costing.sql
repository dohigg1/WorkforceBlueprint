-- E08-01, E08-03, E08-04: cost model. Fully-loaded cost is built up from a base
-- (individual salary where available, otherwise a grade midpoint), employer
-- on-costs, benefits, bonus and an allocable overhead, converted to a reporting
-- currency. Every cost figure the product displays is a MEASURE (INV-6); this
-- migration provides the configuration tables and a per-position projection the
-- measure engine sums over. Grade-based costing is a first-class path, not an
-- edge case: consultants frequently receive no individual salary.

-- Salary is a first-class financial field (INV-7), not hidden in JSONB, so it
-- can be classified and masked. A caller without finance permission sees a
-- masked individual salary but a correct aggregate cost (masking happens at the
-- individual read; aggregates are computed server-side over real values).
ALTER TABLE positions ADD COLUMN base_salary numeric(14,2);
ALTER TABLE positions ADD COLUMN salary_currency text;

INSERT INTO field_classifications (table_name, column_name, classification, default_permission, masking) VALUES
  ('positions', 'base_salary', 'financial', 'finance:read', 'redact'),
  ('positions', 'salary_currency', 'structural', 'read', 'none');

-- Grade midpoint table: cost when individual salary is unavailable or withheld.
CREATE TABLE grade_midpoints (
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  grade         text NOT NULL,
  currency      text NOT NULL,
  midpoint      numeric(14,2) NOT NULL,
  PRIMARY KEY (workspace_id, grade)
);
SELECT wfb_apply_tenancy('grade_midpoints');

-- One cost configuration per workspace. Percentages are fractions (0.30 = 30%).
-- The build-up is transparent: a finance director can decompose any number.
CREATE TABLE cost_config (
  tenant_id          uuid NOT NULL,
  workspace_id       uuid NOT NULL,
  oncost_pct         numeric(6,4) NOT NULL DEFAULT 0.20,
  benefits_pct       numeric(6,4) NOT NULL DEFAULT 0.10,
  bonus_pct          numeric(6,4) NOT NULL DEFAULT 0.08,
  overhead_pct       numeric(6,4) NOT NULL DEFAULT 0.15,
  vacant_factor      numeric(6,4) NOT NULL DEFAULT 1.00,
  reporting_currency text NOT NULL DEFAULT 'GBP',
  PRIMARY KEY (workspace_id)
);
SELECT wfb_apply_tenancy('cost_config');

-- Effective reporting is single-currency per workspace; rates convert source to
-- the reporting currency.
CREATE TABLE fx_rates (
  tenant_id     uuid NOT NULL,
  workspace_id  uuid NOT NULL,
  from_ccy      text NOT NULL,
  to_ccy        text NOT NULL,
  rate          numeric(16,6) NOT NULL,
  PRIMARY KEY (workspace_id, from_ccy, to_ccy)
);
SELECT wfb_apply_tenancy('fx_rates');

-- Conversion helper. Identity when currencies match; falls back to 1 when a rate
-- is absent (documented behaviour so costing never fails hard on a missing rate).
CREATE OR REPLACE FUNCTION wfb_fx(p_from text, p_to text) RETURNS numeric
  LANGUAGE sql STABLE AS
$$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN 1
    ELSE COALESCE((SELECT rate FROM fx_rates WHERE from_ccy = p_from AND to_ccy = p_to LIMIT 1), 1)
  END
$$;

-- Per-position base cost in the reporting currency, plus the vacancy flag. This
-- is a projection, not an aggregate: the measure engine sums it. The reporting
-- currency and grade midpoints are resolved from configuration. Baseline takes a
-- direct-column fast path; a scenario resolves through the overlay.
CREATE OR REPLACE FUNCTION wfb_position_base(p_scenario uuid, p_as_at timestamptz)
  RETURNS TABLE(external_id text, grade text, base_reporting numeric, is_vacant boolean)
  LANGUAGE plpgsql STABLE AS
$$
DECLARE
  rc text;
BEGIN
  SELECT reporting_currency INTO rc FROM cost_config LIMIT 1;
  IF rc IS NULL THEN rc := 'GBP'; END IF;

  IF p_scenario = '00000000-0000-0000-0000-000000000000' THEN
    RETURN QUERY
      SELECT p.external_id, p.grade,
             COALESCE(p.base_salary, gm.midpoint, 0)
               * wfb_fx(COALESCE(p.salary_currency, gm.currency, rc), rc) AS base_reporting,
             (occ.pid IS NULL) AS is_vacant
      FROM positions p
      LEFT JOIN grade_midpoints gm ON gm.grade = p.grade
      LEFT JOIN (
        SELECT DISTINCT position_external_id AS pid FROM occupancies o
        WHERE o.valid_from <= p_as_at AND (o.valid_to IS NULL OR o.valid_to > p_as_at)
      ) occ ON occ.pid = p.external_id
      WHERE p.valid_from <= p_as_at AND (p.valid_to IS NULL OR p.valid_to > p_as_at);
  ELSE
    RETURN QUERY
      WITH rp AS (
        SELECT r.external_id,
               r.doc->>'grade' AS grade,
               NULLIF(r.doc->>'base_salary', '')::numeric AS base_salary,
               r.doc->>'salary_currency' AS salary_currency
        FROM wfb_resolve_entity(p_scenario, 'positions', p_as_at) r
      ),
      occ AS (
        SELECT DISTINCT o.doc->>'position_external_id' AS pid
        FROM wfb_resolve_entity(p_scenario, 'occupancies', p_as_at) o
      )
      SELECT rp.external_id, rp.grade,
             COALESCE(rp.base_salary, gm.midpoint, 0)
               * wfb_fx(COALESCE(rp.salary_currency, gm.currency, rc), rc) AS base_reporting,
             (occ.pid IS NULL) AS is_vacant
      FROM rp
      LEFT JOIN grade_midpoints gm ON gm.grade = rp.grade
      LEFT JOIN occ ON occ.pid = rp.external_id;
  END IF;
END
$$;
