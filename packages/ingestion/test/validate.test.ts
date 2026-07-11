import { describe, it, expect } from 'vitest';
import { validate, type CanonicalRow } from '@wfb/ingestion';

/**
 * E04-04: validation is advisory and flags every defect class. The dataset here
 * is built inline and is obviously synthetic: no real names, no real salaries,
 * no real client data. Validation must never throw or block on a defect.
 */

function baseGradeGroup(): CanonicalRow[] {
  // A dozen well-behaved salaried positions in grade G3 so that an outlier is
  // detectable against a stable standard deviation. Salaries are round,
  // obviously fictional numbers.
  return Array.from({ length: 12 }, (_v, i) => ({
    external_id: `G3-${i}`,
    manager_external_id: 'P1',
    fte: 1,
    cost_centre_external_id: 'CC1',
    grade: 'G3',
    base_salary: 50_000 + i * 500,
    rowIndex: 100 + i,
  }));
}

describe('validate', () => {
  it('detects every defect class on a defective synthetic dataset', () => {
    const rows: CanonicalRow[] = [
      { external_id: 'P1', title: 'Chief', fte: 1, cost_centre_external_id: 'CC1', grade: 'G5', base_salary: 200_000, rowIndex: 0 },
      // Duplicate external identifier.
      { external_id: 'DUP', manager_external_id: 'P1', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 51_000, rowIndex: 1 },
      { external_id: 'DUP', manager_external_id: 'P1', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 52_000, rowIndex: 2 },
      // Orphan: manager not present in the file.
      { external_id: 'ORPH', manager_external_id: 'DOES_NOT_EXIST', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 50_000, rowIndex: 3 },
      // Cycle: C1 and C2 report to each other.
      { external_id: 'C1', manager_external_id: 'C2', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 50_000, rowIndex: 4 },
      { external_id: 'C2', manager_external_id: 'C1', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 50_000, rowIndex: 5 },
      // Non-positive full-time equivalent.
      { external_id: 'ZFTE', manager_external_id: 'P1', fte: 0, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 50_000, rowIndex: 6 },
      // Missing cost centre.
      { external_id: 'NOCC', manager_external_id: 'P1', fte: 1, cost_centre_external_id: null, grade: 'G3', base_salary: 50_000, rowIndex: 7 },
      // Salary outlier within grade G3.
      { external_id: 'OUT', manager_external_id: 'P1', fte: 1, cost_centre_external_id: 'CC1', grade: 'G3', base_salary: 5_000_000, rowIndex: 8 },
      ...baseGradeGroup(),
    ];

    const report = validate(rows);

    expect(report.countsByCode.duplicate_external_id).toBeGreaterThanOrEqual(2);
    expect(report.countsByCode.orphan_manager).toBe(1);
    expect(report.countsByCode.cycle).toBe(2);
    expect(report.countsByCode.non_positive_fte).toBe(1);
    expect(report.countsByCode.missing_cost_centre).toBe(1);
    expect(report.countsByCode.salary_outlier).toBeGreaterThanOrEqual(1);

    // The score is out of one hundred and reflects the defects.
    expect(report.score).toBeLessThan(100);
    expect(report.score).toBeGreaterThanOrEqual(0);

    // Every exception carries a row reference, a severity and a message.
    for (const e of report.exceptions) {
      expect(e.externalId.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'error']).toContain(e.severity);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it('scores a clean dataset at one hundred', () => {
    const rows: CanonicalRow[] = [
      { external_id: 'A', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 0 },
      { external_id: 'B', manager_external_id: 'A', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 1 },
      { external_id: 'C', manager_external_id: 'A', fte: 0.5, cost_centre_external_id: 'CC1', rowIndex: 2 },
    ];
    expect(validate(rows).score).toBe(100);
  });

  it('is advisory: it returns a report rather than throwing on bad data', () => {
    const rows: CanonicalRow[] = [
      { external_id: 'X', manager_external_id: 'X', fte: -1, rowIndex: 0 }, // self-cycle, negative fte, no cost centre
    ];
    expect(() => validate(rows)).not.toThrow();
    const report = validate(rows);
    expect(report.exceptions.length).toBeGreaterThan(0);
  });

  it('does not flag a deep but acyclic chain as a cycle', () => {
    const rows: CanonicalRow[] = [
      { external_id: 'L0', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 0 },
      { external_id: 'L1', manager_external_id: 'L0', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 1 },
      { external_id: 'L2', manager_external_id: 'L1', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 2 },
      { external_id: 'L3', manager_external_id: 'L2', fte: 1, cost_centre_external_id: 'CC1', rowIndex: 3 },
    ];
    expect(validate(rows).countsByCode.cycle).toBe(0);
  });
});
