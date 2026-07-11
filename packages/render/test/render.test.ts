import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, buildDeck, type BoardPackModel } from '@wfb/render';

const MODEL: BoardPackModel = {
  workspaceName: 'Acme Holdings',
  asAt: '2026-07-11',
  structure: { headcount: 219, fte: 206.3, layers: 5, averageSpan: 3.82, vacancies: 16 },
  cost: { loaded: 20699362, perHead: 94518, currency: 'GBP' },
  divisions: [
    { division: 'Technology', headcount: 47, averageSpan: 3.83 },
    { division: 'Operations', headcount: 48, averageSpan: 3.92 },
  ],
  comparison: {
    scenarioName: 'Consolidate People into Operations',
    rows: [
      { measure: 'headcount', baseline: 219, scenario: 217 },
      { measure: 'cost', baseline: 20699362, scenario: 20500000 },
    ],
  },
  exceptions: [
    { code: 'orphan_manager', count: 5 },
    { code: 'duplicate_external_id', count: 3 },
  ],
};

describe('board pack export', () => {
  it('produces a formatted Excel workbook with the expected sheets and a Data sheet', async () => {
    const buf = await buildWorkbook(MODEL);
    expect(buf.length).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Summary');
    expect(names).toContain('Comparison');
    expect(names).toContain('Exceptions');
    expect(names).toContain('Data'); // raw numbers so the client can rebuild
    expect(wb.getWorksheet('Summary')!.getCell('A1').value).toBe('Acme Holdings');
  });

  it('produces a PowerPoint deck as a valid Office Open XML package', async () => {
    const buf = await buildDeck(MODEL);
    expect(buf.length).toBeGreaterThan(1000);
    // Office Open XML files are zip archives beginning with the PK signature.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
