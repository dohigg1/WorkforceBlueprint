-- E13: severance and cost-out. This is the most sensitive data the platform
-- holds. A leak of severance or selection data from a listed client is a
-- market-moving event, so the rules here are stricter than elsewhere:
--   * read access is logged, not merely mutation (INV-3 additional rule);
--   * individual amounts are masked by default even for administrators;
--   * exports are watermarked (handled in the render layer).

-- Allow the audit log to record read access, not only mutations.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_operation_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_operation_check
  CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'READ'));

-- Severance configuration per workspace. The build-up is transparent and
-- configurable: statutory weeks per year of service, a weekly pay cap, a minimum
-- qualifying service, and an enhancement multiplier over statutory.
CREATE TABLE severance_config (
  tenant_id              uuid NOT NULL,
  workspace_id           uuid NOT NULL,
  weeks_per_year         numeric(6,3) NOT NULL DEFAULT 1.0,
  weekly_pay_cap         numeric(12,2) NOT NULL DEFAULT 700.00,
  min_service_years      numeric(5,2) NOT NULL DEFAULT 2.0,
  enhancement_multiplier numeric(6,3) NOT NULL DEFAULT 1.5,
  PRIMARY KEY (workspace_id)
);
SELECT wfb_apply_tenancy('severance_config');
