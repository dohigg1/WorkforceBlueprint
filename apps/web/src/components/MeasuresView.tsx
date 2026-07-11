import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney } from '../api.ts';

interface Props {
  scenarioId: string;
}

interface Kpi {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  money?: boolean;
}

// The KPI strip. Every figure is produced by the one measure engine over a
// declarative definition; there are no bespoke aggregation queries here.
export function MeasuresView({ scenarioId }: Props): JSX.Element {
  const q = useQuery({
    queryKey: ['measures', scenarioId],
    queryFn: () => api.measures(scenarioId),
  });

  if (q.isLoading) return <div className="loading">Evaluating measures…</div>;
  if (q.isError) return <div className="msg err">Could not load measures: {(q.error as Error).message}</div>;
  const m = q.data!;

  const kpis: Kpi[] = [
    { label: 'Headcount', value: fmt(m.headcount), sub: 'positions (seats)' },
    { label: 'Filled', value: fmt(m.filled_headcount), sub: 'occupied' },
    {
      label: 'Vacancies',
      value: fmt(m.vacancies),
      sub: m.headcount ? fmt((m.vacancies / m.headcount) * 100, 1) + '% vacant' : '',
      accent: true,
    },
    { label: 'Full-time equivalent', value: fmt(m.fte, 1), sub: 'sum of position FTE' },
    { label: 'Average span', value: fmt(m.average_span, 2), sub: 'reports per manager' },
    { label: 'Management ratio', value: fmt(m.management_ratio * 100, 0) + '%', sub: 'managers of total' },
    { label: 'Layers', value: fmt(m.layers), sub: 'depth of structure' },
    { label: 'Loaded cost', value: fmtMoney(m.cost), sub: 'fully loaded, annual', accent: true, money: true },
    { label: 'Base cost', value: fmtMoney(m.base_cost), sub: 'salary only', money: true },
    { label: 'Cost per head', value: fmtMoney(m.cost_per_head), sub: 'loaded ÷ headcount', money: true },
  ];

  return (
    <div className="view">
      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="lbl">{k.label}</div>
            <div className={'num' + (k.accent ? ' accent' : '') + (k.money ? ' money' : '')}>{k.value}</div>
            <div className="sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="note" style={{ marginTop: 22 }}>
        Every figure here is output from the one measure engine (INV-6), evaluated over the
        organisation scope at today's date. The same measure evaluated for the chart returns
        identical values.
      </div>
    </div>
  );
}
