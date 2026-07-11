import pptxgenModule from 'pptxgenjs';
import type { BoardPackModel } from './types.js';

// pptxgenjs is a CommonJS module (`export = class`); normalise the default under
// NodeNext ESM interop. Typed loosely because its published types expose a
// namespace rather than a constructable default. Justified use of a loose type.
const PptxGenJS = ((pptxgenModule as any).default ?? pptxgenModule) as new () => any;

/**
 * Export the board pack to a PowerPoint deck using NATIVE, editable tables and
 * text, not images, so a consultant can edit the deck. The output artefact of an
 * organisation design engagement is a deck; producing it automatically is the
 * clearest articulation of value.
 */
export async function buildDeck(model: BoardPackModel): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = 'Workforce Blueprint';
  pptx.title = `${model.workspaceName} organisation review`;

  const INK = '0D1526';
  const CYAN = '2FA6C4';

  // Title slide.
  const title = pptx.addSlide();
  title.background = { color: INK };
  title.addText(model.workspaceName, { x: 0.6, y: 1.8, w: 9, h: 1, fontSize: 34, bold: true, color: 'FFFFFF' });
  title.addText(`Organisation review, as at ${model.asAt}`, { x: 0.6, y: 2.8, w: 9, h: 0.5, fontSize: 16, color: CYAN });

  // Structural summary as a native table.
  const s = pptx.addSlide();
  s.addText('Structural summary', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 22, bold: true, color: INK });
  s.addTable(
    [
      [head('Measure'), head('Value')],
      ['Headcount', String(model.structure.headcount)],
      ['Full-time equivalent', round(model.structure.fte)],
      ['Vacancies', String(model.structure.vacancies)],
      ['Average span of control', round(model.structure.averageSpan)],
      ['Layers', String(model.structure.layers)],
    ],
    { x: 0.5, y: 1.0, w: 5.5, border: { pt: 0.5, color: 'CCCCCC' }, fontSize: 14 },
  );
  s.addText('Cost', { x: 6.4, y: 1.0, w: 3, h: 0.4, fontSize: 16, bold: true, color: INK });
  s.addTable(
    [
      [`Fully loaded (${model.cost.currency})`, round(model.cost.loaded)],
      [`Per head (${model.cost.currency})`, round(model.cost.perHead)],
    ],
    { x: 6.4, y: 1.5, w: 3, border: { pt: 0.5, color: 'CCCCCC' }, fontSize: 14 },
  );

  // Divisions.
  const d = pptx.addSlide();
  d.addText('Headcount by division', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 22, bold: true, color: INK });
  d.addTable(
    [[head('Division'), head('Headcount'), head('Average span')], ...model.divisions.map((r) => [r.division, String(r.headcount), round(r.averageSpan)])],
    { x: 0.5, y: 1.0, w: 8, border: { pt: 0.5, color: 'CCCCCC' }, fontSize: 13 },
  );

  // Comparison.
  if (model.comparison) {
    const c = pptx.addSlide();
    c.addText(`Baseline vs ${model.comparison.scenarioName}`, { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 22, bold: true, color: INK });
    c.addTable(
      [
        [head('Measure'), head('Baseline'), head('Scenario'), head('Delta')],
        ...model.comparison.rows.map((r) => [r.measure, round(r.baseline), round(r.scenario), round(r.scenario - r.baseline)]),
      ],
      { x: 0.5, y: 1.0, w: 8.5, border: { pt: 0.5, color: 'CCCCCC' }, fontSize: 13 },
    );
  }

  // Exceptions.
  const e = pptx.addSlide();
  e.addText('Data quality exceptions', { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 22, bold: true, color: INK });
  e.addTable(
    [[head('Defect'), head('Count')], ...model.exceptions.map((x) => [x.code, String(x.count)])],
    { x: 0.5, y: 1.0, w: 6, border: { pt: 0.5, color: 'CCCCCC' }, fontSize: 14 },
  );

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return Buffer.from(out);
}

function head(text: string): any {
  return { text, options: { bold: true, color: 'FFFFFF', fill: { color: '132038' } } };
}
function round(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-GB');
}
