import { describe, it, expect } from 'vitest';
import {
  proposeMapping,
  overrideProposal,
  saveTemplate,
  applyTemplate,
  mappingAccuracy,
  type MappingProposal,
  type TargetField,
} from '@wfb/ingestion';

/**
 * E04-02: AI-assisted-style column mapping. The mapper must survive genuinely
 * awkward real-world headers, not merely clean ones, because a mapper tested
 * only on sensible names appears to work and then fails on the first real
 * extract. All headers here are synthetic but shaped like real SAP and
 * Workday exports.
 */

const AWKWARD_HEADERS = [
  'Position ID',
  'Position Title (Local)',
  'Emp Grp',
  'FTE%',
  'Cost Ctr',
  'Location',
  'Department',
  'MGR_PERNR',
  'Employee ID',
  'Employee Name',
  'Employee Email Address',
  'Annual Base Sal (GBP)',
  'Grade',
];

const EXPECTED: Record<string, TargetField | null> = {
  'Position ID': 'external_id',
  'Position Title (Local)': 'title',
  'Emp Grp': 'status',
  'FTE%': 'fte',
  'Cost Ctr': 'cost_centre_external_id',
  Location: 'location_external_id',
  Department: 'org_unit_external_id',
  MGR_PERNR: 'manager_external_id',
  'Employee ID': 'person_external_id',
  'Employee Name': 'person_name',
  'Employee Email Address': 'email',
  'Annual Base Sal (GBP)': 'base_salary',
  Grade: 'grade',
};

function byColumn(props: MappingProposal[]): Map<string, TargetField | null> {
  const m = new Map<string, TargetField | null>();
  for (const p of props) m.set(p.sourceColumn, p.targetField);
  return m;
}

describe('proposeMapping against awkward headers', () => {
  const props = proposeMapping(AWKWARD_HEADERS, {});
  const map = byColumn(props);

  it('maps the specifically nasty abbreviations correctly', () => {
    expect(map.get('MGR_PERNR')).toBe('manager_external_id');
    expect(map.get('Cost Ctr')).toBe('cost_centre_external_id');
    expect(map.get('FTE%')).toBe('fte');
    expect(map.get('Annual Base Sal (GBP)')).toBe('base_salary');
  });

  it('does not confuse the manager identifier with the person identifier', () => {
    // MGR_PERNR and Employee ID both look like personnel numbers; the manager
    // prefix must win for the reporting line, which is a line between positions.
    expect(map.get('MGR_PERNR')).toBe('manager_external_id');
    expect(map.get('Employee ID')).toBe('person_external_id');
  });

  it('distinguishes the position identifier from the person identifier', () => {
    expect(map.get('Position ID')).toBe('external_id');
  });

  it('treats an email column as email, not as a person', () => {
    expect(map.get('Employee Email Address')).toBe('email');
  });

  it('achieves at least eighty per cent accuracy on the standard fields', () => {
    const report = mappingAccuracy(props, EXPECTED);
    // Reported number for the record, per the epic's exit criterion.
    // eslint-disable-next-line no-console
    console.log(
      `mapping accuracy on awkward-header set: ${(report.accuracy * 100).toFixed(1)} per cent (${report.correct}/${report.total})`,
    );
    expect(report.accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('gives every proposal a confidence and a plain-English explanation', () => {
    for (const p of props) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
      expect(p.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('overrides and templates', () => {
  it('lets a human override a proposal at full confidence', () => {
    const [first] = proposeMapping(['Weird Column'], {});
    expect(first).toBeDefined();
    const corrected = overrideProposal(first as MappingProposal, 'grade');
    expect(corrected.targetField).toBe('grade');
    expect(corrected.confidence).toBe(1);
  });

  it('saves a mapping as a reusable template and re-applies it', () => {
    const props = proposeMapping(AWKWARD_HEADERS, {});
    const template = saveTemplate('sap-extract-v1', props);
    const reapplied = applyTemplate(template, AWKWARD_HEADERS);
    const map = byColumn(reapplied);
    expect(map.get('MGR_PERNR')).toBe('manager_external_id');
    for (const p of reapplied) expect(p.confidence).toBe(1);
  });

  it('falls back to a fresh proposal for a column not in the template', () => {
    const template = saveTemplate('partial', proposeMapping(['Cost Ctr'], {}));
    const reapplied = applyTemplate(template, ['Cost Ctr', 'FTE%']);
    const map = byColumn(reapplied);
    expect(map.get('Cost Ctr')).toBe('cost_centre_external_id');
    expect(map.get('FTE%')).toBe('fte');
  });
});
