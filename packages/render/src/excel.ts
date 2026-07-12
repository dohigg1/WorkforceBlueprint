import ExcelJS from 'exceljs';
import type { BoardPackModel } from './types.js';

/**
 * Export the board pack to a formatted Excel workbook. The underlying numbers
 * are placed on their own Data sheet so the client can rebuild every figure
 * themselves; the summary sheets are formatted for reading.
 */
export async function buildWorkbook(model: BoardPackModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Workforce Blueprint';
  wb.created = new Date(`${model.asAt}T00:00:00Z`);

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 18 }];
  summary.addRow([model.workspaceName]);
  summary.getCell('A1').font = { bold: true, size: 16 };
  summary.addRow([`As at ${model.asAt}`]);
  if (model.watermark) {
    const wm = summary.addRow([model.watermark]);
    wm.getCell(1).font = { italic: true, color: { argb: 'FFC0392B' } };
  }
  summary.addRow([]);
  summary.addRow(['Structure', '']).getCell(1).font = { bold: true };
  summary.addRow(['Headcount', model.structure.headcount]);
  summary.addRow(['Full-time equivalent', round(model.structure.fte)]);
  summary.addRow(['Vacancies', model.structure.vacancies]);
  summary.addRow(['Average span of control', round(model.structure.averageSpan)]);
  summary.addRow(['Layers', model.structure.layers]);
  summary.addRow([]);
  const costHead = summary.addRow(['Cost', '']);
  costHead.getCell(1).font = { bold: true };
  summary.addRow([`Fully loaded cost (${model.cost.currency})`, round(model.cost.loaded)]);
  summary.addRow([`Cost per head (${model.cost.currency})`, round(model.cost.perHead)]);

  const divs = wb.addWorksheet('Divisions');
  divs.addRow(['Division', 'Headcount', 'Average span']).font = { bold: true };
  for (const d of model.divisions) divs.addRow([d.division, d.headcount, round(d.averageSpan)]);

  if (model.comparison) {
    const cmp = wb.addWorksheet('Comparison');
    cmp.addRow([`Baseline vs ${model.comparison.scenarioName}`]).getCell(1).font = { bold: true };
    cmp.addRow(['Measure', 'Baseline', 'Scenario', 'Delta']).font = { bold: true };
    for (const r of model.comparison.rows) {
      cmp.addRow([r.measure, round(r.baseline), round(r.scenario), round(r.scenario - r.baseline)]);
    }
  }

  const exc = wb.addWorksheet('Exceptions');
  exc.addRow(['Defect', 'Count']).font = { bold: true };
  for (const e of model.exceptions) exc.addRow([e.code, e.count]);

  // The raw data on its own sheet, so the client can rebuild the numbers.
  const data = wb.addWorksheet('Data');
  data.addRow(['key', 'value']);
  data.addRow(['headcount', model.structure.headcount]);
  data.addRow(['fte', model.structure.fte]);
  data.addRow(['vacancies', model.structure.vacancies]);
  data.addRow(['average_span', model.structure.averageSpan]);
  data.addRow(['layers', model.structure.layers]);
  data.addRow(['cost_loaded', model.cost.loaded]);
  data.addRow(['cost_per_head', model.cost.perHead]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
