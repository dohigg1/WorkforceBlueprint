import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario } from '../api.ts';

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onNavigate: (tab: 'structure' | 'measures' | 'scenario' | 'ingestion') => void;
}

// Division colours mirror the org chart so the composition bar reads the same.
const DIV_COLOURS: Record<string, string> = {
  Executive: '#8a97ab',
  Technology: '#635bff',
  Commercial: '#4f8bff',
  Operations: '#12a76a',
  Finance: '#ef8a10',
  People: '#e5484d',
  Product: '#a06bff',
};

function ArrowRight(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// The landing dashboard. It is a reading of the same measure engine that drives
// every other surface, arranged as a headline the way an executive would want
// it: the size and cost of the organisation first, then its shape, then the
// impact of the active scenario, all at today's date.
export function Overview({ scenarioId, scenarios, onNavigate }: Props): JSX.Element {
  const measures = useQuery({
    queryKey: ['measures', scenarioId],
    queryFn: () => api.measures(scenarioId),
  });

  const activeScenarioId = scenarioId !== BASELINE ? scenarioId : scenarios[0]?.id;
  const compare = useQuery({
    queryKey: ['compare', activeScenarioId],
    queryFn: () => api.compare(activeScenarioId!),
    enabled: !!activeScenarioId,
  });

  const tree = useQuery({ queryKey: ['tree', scenarioId], queryFn: () => api.tree(scenarioId) });

  if (measures.isLoading) return <div className="loading">Evaluating the organisation…</div>;
  if (measures.isError) return <div className="view"><div className="msg err">Could not load measures: {(measures.error as Error).message}</div></div>;
  const m = measures.data!;

  const vacRate = m.headcount ? (m.vacancies / m.headcount) * 100 : 0;

  // Scenario headline: cost delta and headcount delta against the baseline.
  let costDelta: number | null = null;
  let headDelta: number | null = null;
  if (compare.data) {
    costDelta = (compare.data.scenario.cost ?? 0) - (compare.data.baseline.cost ?? 0);
    headDelta = (compare.data.scenario.headcount ?? 0) - (compare.data.baseline.headcount ?? 0);
  }
  const scenarioName = scenarios.find((s) => s.id === activeScenarioId)?.name;

  // Division composition from the current tree (a reading, not a stored total).
  const byDiv = new Map<string, number>();
  for (const n of tree.data?.nodes ?? []) {
    const d = n.division ?? 'Unassigned';
    byDiv.set(d, (byDiv.get(d) ?? 0) + 1);
  }
  const total = tree.data?.nodes.length ?? 0;
  const divisions = [...byDiv.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="view">
      <div className="hero">
        <div className="h-eyebrow">Demo workspace · as at today</div>
        <h3>A validated, costed and navigable organisation.</h3>
        <div className="h-stats">
          <div className="h-stat">
            <div className="k">Positions</div>
            <div className="v">{fmt(m.headcount)}</div>
            <div className="d">{fmt(m.filled_headcount)} filled · {fmt(m.vacancies)} vacant</div>
          </div>
          <div className="h-stat">
            <div className="k">Loaded annual cost</div>
            <div className="v">{fmtMoney(m.cost)}</div>
            <div className="d">{fmtMoney(m.cost_per_head)} per head</div>
          </div>
          <div className="h-stat">
            <div className="k">Layers</div>
            <div className="v">{fmt(m.layers)}</div>
            <div className="d">avg span {fmt(m.average_span, 1)}</div>
          </div>
        </div>
      </div>

      <div className="section-title">Headline measures <span className="muted">· one engine, organisation scope</span></div>
      <div className="kpis">
        <Kpi label="Headcount" value={fmt(m.headcount)} sub="positions (seats)" />
        <Kpi label="Full-time equivalent" value={fmt(m.fte, 1)} sub="sum of position FTE" />
        <Kpi label="Vacancies" value={fmt(m.vacancies)} sub={fmt(vacRate, 1) + '% of positions'} accent />
        <Kpi label="Loaded cost" value={fmtMoney(m.cost)} sub="fully loaded, annual" money accent />
        <Kpi label="Average span" value={fmt(m.average_span, 2)} sub="reports per manager" />
        <Kpi label="Cost per head" value={fmtMoney(m.cost_per_head)} sub="loaded ÷ headcount" money />
      </div>

      <div className="grid-2" style={{ marginTop: 30 }}>
        <div className="panel">
          <div className="p-head">
            <div className="p-title">Scenario impact</div>
            <button className="link-btn" onClick={() => onNavigate('scenario')}>Open scenarios <ArrowRight /></button>
          </div>
          <div className="p-sub">
            {scenarioName ? `“${scenarioName}” compared with the untouched baseline` : 'No scenario yet'}
          </div>
          {compare.isLoading && <div className="loading" style={{ padding: 0 }}>Comparing…</div>}
          {compare.data && (
            <div className="mini-stats">
              <div className="mini-stat">
                <div className="k">Cost movement</div>
                <div className="v" style={{ color: (costDelta ?? 0) <= 0 ? 'var(--good)' : 'var(--crit)' }}>
                  {costDelta == null ? '—' : (costDelta > 0 ? '+' : '') + fmtMoney(costDelta)}
                </div>
              </div>
              <div className="mini-stat">
                <div className="k">Headcount movement</div>
                <div className="v" style={{ color: (headDelta ?? 0) <= 0 ? 'var(--good)' : 'var(--crit)' }}>
                  {headDelta == null ? '—' : (headDelta > 0 ? '+' : '') + fmt(headDelta)}
                </div>
              </div>
              <div className="mini-stat">
                <div className="k">Scenario cost</div>
                <div className="v">{fmtMoney(compare.data.scenario.cost ?? 0)}</div>
              </div>
              <div className="mini-stat">
                <div className="k">Scenario layers</div>
                <div className="v">{fmt(compare.data.scenario.layers ?? 0)}</div>
              </div>
            </div>
          )}
          {!activeScenarioId && (
            <div className="note" style={{ marginTop: 4 }}>
              Create a scenario to model a restructure as a copy-on-write overlay, resolved at read
              time. The baseline is never touched.
            </div>
          )}
        </div>

        <div className="panel">
          <div className="p-head">
            <div className="p-title">Composition by division</div>
            <button className="link-btn" onClick={() => onNavigate('structure')}>View chart <ArrowRight /></button>
          </div>
          <div className="p-sub">{fmt(total)} positions across {divisions.length} divisions</div>
          <div className="compbar">
            {divisions.map(([d, n]) => (
              <i key={d} style={{ width: `${(n / total) * 100}%`, background: DIV_COLOURS[d] ?? '#8a97ab' }} title={`${d}: ${n}`} />
            ))}
          </div>
          <div className="complegend">
            {divisions.slice(0, 7).map(([d, n]) => (
              <span key={d}>
                <i style={{ background: DIV_COLOURS[d] ?? '#8a97ab' }} />
                {d} <b>{fmt(n)}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Start here</div>
      <div className="kpis">
        <ActionCard title="Ingest a spreadsheet" body="Paste a messy HR extract. The semantic layer maps columns and scores quality." onClick={() => onNavigate('ingestion')} />
        <ActionCard title="Explore the structure" body="Navigate the hierarchy of positions, laid out server side, rendered on canvas." onClick={() => onNavigate('structure')} />
        <ActionCard title="Model a restructure" body="Build a scenario overlay and compare it against the baseline, side by side." onClick={() => onNavigate('scenario')} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, money }: { label: string; value: string; sub: string; accent?: boolean; money?: boolean }): JSX.Element {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className={'num' + (accent ? ' accent' : '') + (money ? ' money' : '')}>{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function ActionCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }): JSX.Element {
  return (
    <button className="kpi" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)' }} onClick={onClick}>
      <div className="num" style={{ fontSize: 15, marginTop: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {title} <span style={{ color: 'var(--accent)' }}><ArrowRight /></span>
      </div>
      <div className="sub" style={{ marginTop: 9, lineHeight: 1.5 }}>{body}</div>
    </button>
  );
}
