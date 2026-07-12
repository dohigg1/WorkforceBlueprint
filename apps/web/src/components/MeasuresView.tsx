import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney } from '../api.ts';
import { Icon } from '../ui.tsx';

interface Props { scenarioId: string; }

interface Def {
  key: string;
  label: string;
  unit: string;
  definition: string;
  format: (v: number) => string;
}

const DEFS: Def[] = [
  { key: 'headcount', label: 'Headcount', unit: 'positions', definition: 'Count of positions (seats) in scope, filled or vacant.', format: (v) => fmt(v) },
  { key: 'filled_headcount', label: 'Filled positions', unit: 'positions', definition: 'Positions with at least one occupant.', format: (v) => fmt(v) },
  { key: 'vacancies', label: 'Vacancies', unit: 'positions', definition: 'Positions with no occupant.', format: (v) => fmt(v) },
  { key: 'fte', label: 'Full-time equivalent', unit: 'FTE', definition: 'Sum of position full-time-equivalent apportionment.', format: (v) => fmt(v, 1) },
  { key: 'average_span', label: 'Average span of control', unit: 'ratio', definition: 'Mean number of direct reports across managers.', format: (v) => fmt(v, 2) },
  { key: 'management_ratio', label: 'Management ratio', unit: 'per cent', definition: 'Share of positions that manage at least one report.', format: (v) => fmt(v * 100, 1) + '%' },
  { key: 'layers', label: 'Layers', unit: 'levels', definition: 'Depth of the reporting structure, root to deepest report.', format: (v) => fmt(v) },
  { key: 'cost', label: 'Loaded cost', unit: 'GBP / year', definition: 'Fully loaded annual cost: base, on-costs, benefits, bonus and overhead.', format: (v) => fmtMoney(v) },
  { key: 'base_cost', label: 'Base cost', unit: 'GBP / year', definition: 'Base salary only, vacancy-adjusted.', format: (v) => fmtMoney(v) },
  { key: 'cost_per_head', label: 'Cost per head', unit: 'GBP / year', definition: 'Loaded cost divided by headcount.', format: (v) => fmtMoney(v) },
];

export function MeasuresView({ scenarioId }: Props): JSX.Element {
  const q = useQuery({ queryKey: ['measures', scenarioId], queryFn: () => api.measures(scenarioId) });

  if (q.isLoading) return <div className="skeleton" style={{ height: 400 }} aria-label="Evaluating measures" />;
  if (q.isError) return <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">Could not load measures. {(q.error as Error).message}</div></div>;
  const m = q.data!;

  return (
    <div>
      <div className="alert info" role="note" style={{ marginBottom: 16 }}>
        <Icon name="info" />
        <div className="a-body">Every value is produced by the one measure engine over the organisation scope at today's date. There are no bespoke aggregation queries.</div>
      </div>
      <div className="section-h"><h3 id="ml-h">Standard measure library</h3><span className="s-sub">{DEFS.length} measures · organisation scope</span></div>
      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data" aria-labelledby="ml-h">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="num">Value</th>
                <th scope="col">Unit</th>
                <th scope="col">Definition</th>
              </tr>
            </thead>
            <tbody>
              {DEFS.map((d) => (
                <tr key={d.key}>
                  <td className="cell" style={{ fontWeight: 600 }}>{d.label}</td>
                  <td className="cell num">{d.format(m[d.key] ?? 0)}</td>
                  <td className="cell" style={{ color: 'var(--muted)' }}>{d.unit}</td>
                  <td className="cell" style={{ color: 'var(--text-2)' }}>{d.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
