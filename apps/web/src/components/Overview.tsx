import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario, TreeNode } from '../api.ts';
import { Icon, DIVISION_COLOURS, InfoPopover, effectiveDate, type MetricDef } from '../ui.tsx';

const METRIC_DEFS: Record<string, MetricDef> = {
  headcount: { title: 'Total positions', formula: 'count(positions in scope)', detail: 'Seats in the organisation, filled or vacant. A vacant seat is still counted.', period: 'As at effective date', source: 'Measure engine' },
  fte: { title: 'Full-time equivalent', formula: 'sum(position FTE)', detail: 'Sum of full-time-equivalent apportionment across positions in scope.', period: 'As at effective date', source: 'Measure engine' },
  cost: { title: 'Total loaded cost', formula: 'sum(base + on-costs + benefits + bonus + overhead)', detail: 'Fully loaded annual cost of all positions in scope, vacancy-adjusted.', period: 'Annualised', source: 'Measure engine' },
  cost_per_head: { title: 'Loaded cost per position', formula: 'total loaded cost ÷ positions', detail: 'Divided by all positions (filled and vacant), not by filled incumbents.', period: 'Annualised', source: 'Measure engine' },
};

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onNavigate: (tab: 'structure' | 'measures' | 'scenario' | 'ingestion') => void;
}

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(2) + 'M';
  return '£' + Math.round(n).toLocaleString('en-GB');
}
function moneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '£' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return '£' + Math.round(n / 1_000) + 'k';
  return '£' + Math.round(n);
}

// Ranked horizontal comparison of a categorical measure. Bars are sorted by
// value with direct labels, so no legend or angle comparison is required. The
// preceding total and the accessible table (below) carry the same figures.
function RankBars({ items, max }: { items: { label: string; value: number; share: number; colour: string }[]; max: number }): JSX.Element {
  return (
    <div className="rankbars" role="img" aria-label="Loaded cost by division, ranked">
      {items.map((it) => (
        <div className="rankbar" key={it.label}>
          <div className="rb-top">
            <span className="rb-name"><span className="sw" style={{ background: it.colour }} />{it.label}</span>
            <span className="rb-val">{moneyShort(it.value)}<span className="pct">{fmt(it.share, 0)}%</span></span>
          </div>
          <div className="rb-track"><div className="rb-fill" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: it.colour }} /></div>
        </div>
      ))}
    </div>
  );
}

// A target-band bullet row: the acceptable range is shaded, the current value is
// marked, and the variance and direction are stated in words as well as by
// a status tag, so meaning never rests on colour alone.
function Bullet({ label, value, display, unit, max, band }: { label: string; value: number; display: string; unit: string; max: number; band: [number, number] }): JSX.Element {
  const [lo, hi] = band;
  const within = value >= lo && value <= hi;
  const pct = (v: number): number => Math.max(0, Math.min(100, (v / max) * 100));
  const tone = within ? 'good' : 'warn';
  const dist = within ? 0 : value < lo ? lo - value : value - hi;
  const note = within ? 'Within range' : `${fmt(dist, unit === 'ratio' ? 1 : 0)}${unit === '%' ? ' pp' : ''} ${value < lo ? 'below' : 'above'} range`;
  return (
    <div className="bullet" role="group" aria-label={`${label}: ${display}, ${note.toLowerCase()}, target ${lo} to ${hi}`}>
      <div className="bl-top"><span className="bl-name">{label}</span><span className="bl-val">{display}</span></div>
      <div className="bl-track">
        <span className="bl-band" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
        <span className="bl-marker" style={{ left: `${pct(value)}%`, background: within ? 'var(--good)' : 'var(--crit)' }} />
      </div>
      <div className="bl-note"><span className={'tag ' + tone}>{within ? 'On target' : value < lo ? 'Below' : 'Above'}</span> {note} · target {lo}–{hi}</div>
    </div>
  );
}

function Trend({ delta, favourableWhenNegative, money: isMoney }: { delta: number; favourableWhenNegative?: boolean; money?: boolean }): JSX.Element {
  const flat = Math.abs(delta) < (isMoney ? 0.5 : 0.005);
  if (flat) return <span className="trend neutral">No change</span>;
  const favourable = favourableWhenNegative === undefined ? undefined : (delta < 0) === favourableWhenNegative;
  const tone = favourable === undefined ? 'neutral' : favourable ? 'favourable' : 'adverse';
  const sign = delta > 0 ? '+' : '';
  return (
    <span className={'trend ' + tone}>
      <Icon name={delta > 0 ? 'upRight' : 'downRight'} />
      {sign}{isMoney ? fmtMoney(delta) : fmt(delta)}
    </span>
  );
}

export function Overview({ scenarioId, scenarios, onNavigate }: Props): JSX.Element {
  const measures = useQuery({ queryKey: ['measures', scenarioId], queryFn: () => api.measures(scenarioId) });
  const tree = useQuery({ queryKey: ['tree', scenarioId], queryFn: () => api.tree(scenarioId) });
  const activeScenarioId = scenarioId !== BASELINE ? scenarioId : scenarios[0]?.id;
  const compare = useQuery({ queryKey: ['compare', activeScenarioId], queryFn: () => api.compare(activeScenarioId!), enabled: !!activeScenarioId });

  const [division, setDivision] = useState('All');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allNodes = tree.data?.nodes ?? [];
  const divisions = useMemo(() => [...new Set(allNodes.map((n) => n.division ?? 'Unassigned'))].sort(), [allNodes]);
  const nodes = useMemo(
    () => (division === 'All' ? allNodes : allNodes.filter((n) => (n.division ?? 'Unassigned') === division)),
    [allNodes, division],
  );

  const costByDiv = useMemo(() => {
    const by = new Map<string, number>();
    for (const n of allNodes) { const d = n.division ?? 'Unassigned'; by.set(d, (by.get(d) ?? 0) + (n.cost ?? 0)); }
    return [...by.entries()].map(([label, value]) => ({ label, value, colour: DIVISION_COLOURS[label] ?? '#98a2b3' })).sort((a, b) => b.value - a.value);
  }, [allNodes]);
  const costTotal = costByDiv.reduce((a, s) => a + s.value, 0);
  const hasCost = allNodes.some((n) => n.cost != null);

  const layerRows = useMemo(() => {
    const by = new Map<number, number>();
    for (const n of nodes) by.set(n.layer, (by.get(n.layer) ?? 0) + 1);
    const max = Math.max(...by.keys(), 0);
    return Array.from({ length: max + 1 }, (_, l) => ({ layer: l, count: by.get(l) ?? 0 }));
  }, [nodes]);
  const maxLayerCount = Math.max(1, ...layerRows.map((r) => r.count));

  const grid = useMemo(() => {
    const set = new Set(nodes.map((n) => n.id));
    const kids = new Map<string, TreeNode[]>();
    const roots: TreeNode[] = [];
    for (const n of nodes) {
      if (n.parent && set.has(n.parent)) (kids.get(n.parent) ?? (kids.set(n.parent, []).get(n.parent) as TreeNode[])).push(n);
      else roots.push(n);
    }
    const fteSum = new Map<string, number>(); const costSum = new Map<string, number>();
    const walk = (n: TreeNode): [number, number] => {
      let f = n.fte; let cc = n.cost ?? 0;
      for (const k of kids.get(n.id) ?? []) { const [cf, ck] = walk(k); f += cf; cc += ck; }
      fteSum.set(n.id, f); costSum.set(n.id, cc); return [f, cc];
    };
    for (const rt of roots) walk(rt);
    return { kids, roots, fteSum, costSum, rootFte: Math.max(1, ...roots.map((r) => fteSum.get(r.id) ?? 0)), rootCost: Math.max(1, ...roots.map((r) => costSum.get(r.id) ?? 0)) };
  }, [nodes]);

  const defaultExpanded = useMemo(() => {
    const s = new Set<string>();
    for (const rt of grid.roots) { s.add(rt.id); for (const k of grid.kids.get(rt.id) ?? []) s.add(k.id); }
    return s;
  }, [grid]);
  const effExpanded = expanded.size === 0 ? defaultExpanded : expanded;

  const visibleRows = useMemo(() => {
    const rows: { node: TreeNode; depth: number; hasKids: boolean }[] = [];
    const push = (n: TreeNode, depth: number): void => {
      const children = grid.kids.get(n.id) ?? [];
      rows.push({ node: n, depth, hasKids: children.length > 0 });
      if (effExpanded.has(n.id)) for (const cN of [...children].sort((a, b) => (grid.costSum.get(b.id) ?? 0) - (grid.costSum.get(a.id) ?? 0))) push(cN, depth + 1);
    };
    for (const rt of [...grid.roots].sort((a, b) => (grid.costSum.get(b.id) ?? 0) - (grid.costSum.get(a.id) ?? 0))) push(rt, 0);
    return rows.slice(0, 400);
  }, [grid, effExpanded]);

  function toggle(id: string): void {
    const next = new Set(effExpanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  }

  if (measures.isLoading) {
    return (
      <div className="metric-grid" aria-busy="true" aria-label="Loading measures">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 108 }} />)}
      </div>
    );
  }
  if (measures.isError) return <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">Could not load measures. {(measures.error as Error).message}</div></div>;
  const m = measures.data!;
  const scenarioName = scenarioId === BASELINE ? 'Baseline' : scenarios.find((s) => s.id === scenarioId)?.name ?? 'Scenario';
  const basis = scenarioId !== BASELINE ? compare.data?.baseline : undefined;
  const vacRate = m.headcount ? (m.vacancies / m.headcount) * 100 : 0;

  const metrics = [
    { key: 'headcount', label: 'Total positions', value: fmt(m.headcount), raw: m.headcount, fav: undefined as boolean | undefined, foot: `${fmt(m.filled_headcount)} filled · ${fmt(m.vacancies)} vacant`, money: false },
    { key: 'fte', label: 'Full-time equivalent', value: fmt(m.fte, 0), raw: m.fte, fav: undefined, foot: 'Sum of position FTE', money: false },
    { key: 'cost', label: 'Total loaded cost', value: fmtMoney(m.cost), raw: m.cost, fav: true, foot: 'Annualised, fully loaded', money: true },
    { key: 'cost_per_head', label: 'Loaded cost per position', value: fmtMoney(m.cost_per_head), raw: m.cost_per_head, fav: true, foot: 'Loaded cost ÷ positions', money: true },
  ];

  return (
    <div>
      {/* Filter toolbar */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="filter-chip">
          <label htmlFor="ov-division">Division</label>
          <select id="ov-division" value={division} onChange={(e) => { setDivision(e.target.value); setExpanded(new Set()); }}>
            <option value="All">All divisions</option>
            {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {division !== 'All' && (
          <div className="active-filters">
            <span className="remove-chip">Division: {division}
              <button aria-label={`Remove division filter ${division}`} onClick={() => { setDivision('All'); setExpanded(new Set()); }}><Icon name="x" /></button>
            </span>
            <button className="link-btn" onClick={() => { setDivision('All'); setExpanded(new Set()); }}>Clear all</button>
          </div>
        )}
        <span className="results-count" style={{ marginLeft: 'auto' }} aria-live="polite">
          {division === 'All' ? 'All divisions' : division} · {fmt(nodes.length)} position{nodes.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Current state */}
      <div className="section-h"><h3 id="sec-state">Current organisation{scenarioId !== BASELINE ? ' (scenario)' : ''}</h3></div>
      <div className="metric-grid" aria-labelledby="sec-state">
        {metrics.map((mt) => {
          const delta = basis ? mt.raw - (basis[mt.key] ?? 0) : null;
          return (
            <div className="metric" key={mt.key}>
              <div className="m-label">{mt.label}{METRIC_DEFS[mt.key] && <InfoPopover def={METRIC_DEFS[mt.key]} />}</div>
              <div className={'m-value' + (mt.money ? ' money' : '')}>{mt.value}</div>
              <div className="m-foot">
                {delta != null ? <Trend delta={delta} favourableWhenNegative={mt.fav} money={mt.money} /> : <span className="tnum">{mt.foot}</span>}
                {delta != null && <span>vs baseline</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="bento">
        <section className="card card-pad col-5" aria-labelledby="cd-h">
          <div className="section-h"><h3 id="cd-h">Loaded cost by division</h3><span className="s-sub">Annualised, GBP</span></div>
          {hasCost ? (
            <>
              <RankBars items={costByDiv.map((s) => ({ label: s.label, value: s.value, share: (s.value / costTotal) * 100, colour: s.colour }))} max={Math.max(...costByDiv.map((s) => s.value), 1)} />
              <table className="legend-table" style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <caption className="s-sub" style={{ textAlign: 'left', margin: '8px 0 6px' }}>Accessible table</caption>
                <thead><tr><th scope="col">Division</th><th scope="col" className="num">Cost</th><th scope="col" className="num">Share</th></tr></thead>
                <tbody>
                  {costByDiv.map((s) => (
                    <tr key={s.label}><td>{s.label}</td><td className="num">{fmtMoney(s.value)}</td><td className="num">{fmt((s.value / costTotal) * 100, 0)}%</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="chart-foot"><span>Source: measure engine</span><span>Total {fmtMoney(costTotal)}</span></div>
            </>
          ) : <div className="empty-state"><p>Per-position cost is not available in this read.</p></div>}
        </section>

        <section className="card card-pad col-4" aria-labelledby="tg-h">
          <div className="section-h"><h3 id="tg-h">Structural measures</h3><span className="s-sub">vs reference band</span></div>
          <div className="bullets">
            <Bullet label="Average span of control" value={m.average_span} display={fmt(m.average_span, 1)} unit="ratio" max={12} band={[5, 9]} />
            <Bullet label="Management ratio" value={m.management_ratio * 100} display={fmt(m.management_ratio * 100, 1) + '%'} unit="%" max={40} band={[15, 25]} />
            <Bullet label="Vacancy rate" value={vacRate} display={fmt(vacRate, 1) + '%'} unit="%" max={20} band={[0, 10]} />
          </div>
          <div className="chart-foot"><span>Reference bands are illustrative</span></div>
        </section>

        <section className="card card-pad col-3" aria-labelledby="ly-h">
          <div className="section-h"><h3 id="ly-h">Positions by layer</h3></div>
          <div className="barlist">
            {layerRows.map((r) => (
              <div className="b-row" key={r.layer}>
                <span className="b-k">Layer {r.layer + 1}</span>
                <div className="b-track"><div className="b-fill" style={{ width: `${Math.max(2, (r.count / maxLayerCount) * 100)}%` }} /></div>
                <span className="b-v">{fmt(r.count)}</span>
              </div>
            ))}
          </div>
          <div className="chart-foot"><span>{layerRows.length} layers</span><span>{fmt(nodes.length)} positions</span></div>
        </section>
      </div>

      {/* Position-level detail table */}
      <div className="section-h" style={{ marginTop: 28 }}>
        <div>
          <h3 id="det-h">Position-level detail</h3>
          <span className="s-sub">Subtree full-time equivalent and loaded cost, {division === 'All' ? 'whole organisation' : division}</span>
        </div>
        <button className="btn btn-secondary sm" onClick={() => onNavigate('structure')}><Icon name="org" /> Open chart</button>
      </div>
      <div className="results-count" style={{ marginBottom: 8 }} aria-live="polite">Showing {fmt(visibleRows.length)} of {fmt(nodes.length)} positions</div>
      <div className="table-wrap">
        <div className="table-scroll">
          <table className="data" aria-labelledby="det-h">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col" className="num">Sum FTE</th>
                <th scope="col" className="num">Sum loaded cost (GBP)</th>
                <th scope="col" className="num">Span</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ node, depth, hasKids }) => {
                const fteV = grid.fteSum.get(node.id) ?? node.fte;
                const costV = grid.costSum.get(node.id) ?? 0;
                return (
                  <tr key={node.id}>
                    <td>
                      <div className="rolecell" style={{ paddingLeft: 14 + depth * 18 }}>
                        {hasKids ? (
                          <button className="disc" aria-expanded={effExpanded.has(node.id)} aria-label={(effExpanded.has(node.id) ? 'Collapse ' : 'Expand ') + node.title} onClick={() => toggle(node.id)}>
                            <Icon name="chevronRight" />
                          </button>
                        ) : <span className="disc leaf" />}
                        <span className="swatch" style={{ background: DIVISION_COLOURS[node.division ?? 'Unassigned'] ?? '#98a2b3' }} aria-hidden="true" />
                        <span className="nm" title={node.title}>{node.title}</span>
                        {node.vacant && <span className="tag warn" style={{ marginLeft: 4 }}>Vacant</span>}
                      </div>
                    </td>
                    <td><div className="databar"><div className="track"><div className="fill" style={{ width: `${(fteV / grid.rootFte) * 100}%` }} /></div><span className="v">{fmt(fteV, fteV < 100 ? 1 : 0)}</span></div></td>
                    <td><div className="databar"><div className="track">{hasCost && <div className="fill" style={{ width: `${(costV / grid.rootCost) * 100}%` }} />}</div><span className={'v' + (hasCost ? '' : ' muted')}>{hasCost ? money(costV) : 'Not available'}</span></div></td>
                    <td className="cell num">{node.span > 0 ? fmt(node.span) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details className="govern">
        <summary><Icon name="info" /> Data and governance <Icon name="chevronRight" /></summary>
        <div className="g-body">
          <div className="govern-grid">
            <div className="gg-row"><span className="k">Reading</span><span className="v">{scenarioName}</span></div>
            <div className="gg-row"><span className="k">Effective date</span><span className="v tnum">{effectiveDate()}</span></div>
            <div className="gg-row"><span className="k">Data source</span><span className="v">Measure engine</span></div>
            <div className="gg-row"><span className="k">Dataset</span><span className="v">Synthetic, {fmt(allNodes.length)} positions</span></div>
            <div className="gg-row"><span className="k">Environment</span><span className="v">Demonstration</span></div>
            <div className="gg-row"><span className="k">Record owner</span><span className="v">Demo workspace</span></div>
            <div className="gg-row"><span className="k">Cost data classification</span><span className="v">Restricted (personal)</span></div>
            <div className="gg-row"><span className="k">Your access</span><span className="v">Owner · cost visible</span></div>
          </div>
          <p className="s-sub" style={{ marginTop: 12, marginBottom: 0 }}>
            Individual position cost is masked by default and shown here because the reader holds the owner role. Row-level security is enforced server-side; client controls do not confer access.
          </p>
        </div>
      </details>
    </div>
  );
}
