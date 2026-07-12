import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario } from '../api.ts';
import { Icon, type Toast } from '../ui.tsx';

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onSelectScenario: (id: string) => void;
  onNotify: (t: Omit<Toast, 'id'>) => void;
}

interface DeltaSpec { label: string; key: string; digits: number; money?: boolean; favourableWhenNegative?: boolean; }
const DELTAS: DeltaSpec[] = [
  { label: 'Headcount', key: 'headcount', digits: 0 },
  { label: 'Loaded cost', key: 'cost', digits: 0, money: true, favourableWhenNegative: true },
  { label: 'Average span', key: 'average_span', digits: 2 },
  { label: 'Layers', key: 'layers', digits: 0 },
];

export function ScenarioView({ scenarioId, scenarios, onSelectScenario, onNotify }: Props): JSX.Element {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const create = useMutation({
    mutationFn: (n: string) => api.createScenario(n),
    onSuccess: (res) => {
      setName(''); setTouched(false);
      qc.invalidateQueries({ queryKey: ['scenarios'] });
      onSelectScenario(res.id);
      onNotify({ tone: 'good', title: 'Scenario created', body: 'The overlay is empty until you make an edit. The baseline is untouched.' });
    },
  });

  const compareId = scenarioId !== BASELINE ? scenarioId : scenarios[0]?.id;
  const compare = useQuery({ queryKey: ['compare', compareId], queryFn: () => api.compare(compareId!), enabled: !!compareId });

  const nameError = touched && !name.trim() ? 'Enter a name for the scenario.' : '';

  return (
    <div className="view narrow" style={{ padding: 0, maxWidth: 'none' }}>
      <section className="card card-pad" style={{ marginBottom: 24, maxWidth: 640 }}>
        <div className="section-h"><h3>Create a scenario</h3></div>
        <form onSubmit={(e) => { e.preventDefault(); setTouched(true); if (name.trim()) create.mutate(name.trim()); }} noValidate>
          <div className="form-field">
            <label htmlFor="scenario-name">Scenario name <span className="req" aria-hidden="true">*</span></label>
            <input
              id="scenario-name" value={name} required
              aria-invalid={nameError ? 'true' : undefined}
              aria-describedby={nameError ? 'scenario-name-err' : 'scenario-name-hint'}
              onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)}
              placeholder="e.g. Consolidate support functions"
            />
            {nameError
              ? <span className="err-text" id="scenario-name-err"><Icon name="alert" />{nameError}</span>
              : <span className="hint" id="scenario-name-hint">A copy-on-write overlay resolved at read time. The baseline is never modified.</span>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={create.isPending} aria-busy={create.isPending}>
            <Icon name="plus" /> Create scenario
          </button>
          {create.isError && <div className="alert crit" role="alert" style={{ marginTop: 12 }}><Icon name="alert" /><div className="a-body">{(create.error as Error).message}</div></div>}
        </form>
      </section>

      <div className="section-h"><h3 id="sc-list">Scenarios</h3><span className="s-sub">{scenarios.length + 1} total</span></div>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data" aria-labelledby="sc-list">
          <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Reading</th></tr></thead>
          <tbody>
            {[{ id: BASELINE, name: 'Baseline', kind: 'live' as const }, ...scenarios.map((s) => ({ id: s.id, name: s.name, kind: 'overlay' as const }))].map((row) => (
              <tr key={row.id}>
                <td className="cell" style={{ fontWeight: 600 }}>{row.name}</td>
                <td className="cell"><span className={'tag ' + (row.kind === 'live' ? 'good' : 'info')}>{row.kind === 'live' ? 'Baseline' : 'Overlay'}</span></td>
                <td className="cell" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {scenarioId === row.id
                    ? <span className="tag neutral plain">Currently reading</span>
                    : <button className="link-btn" onClick={() => onSelectScenario(row.id)}>Read this</button>}
                  {row.kind === 'overlay' && (
                    <button className="link-btn" style={{ color: 'var(--muted)' }} aria-disabled="true"
                      title="Merging a scenario into the baseline requires an administrator role"
                      onClick={() => onNotify({ tone: 'info', title: 'Insufficient permissions', body: 'Merging a scenario into the baseline requires an administrator role.' })}>
                      Merge to baseline
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-h">
        <h3 id="cmp-h">Comparison</h3>
        <span className="s-sub">{compareId ? `${scenarios.find((s) => s.id === compareId)?.name ?? 'Scenario'} vs baseline` : ''}</span>
      </div>
      {!compareId && <div className="empty-state card"><div className="es-ic"><Icon name="branch" /></div><h4>No scenario to compare</h4><p>Create a scenario to compare a restructure against the baseline.</p></div>}
      {compare.isLoading && <div className="skeleton" style={{ height: 120 }} aria-label="Comparing" />}
      {compare.isError && <div className="alert crit" role="alert"><Icon name="alert" /><div className="a-body">{(compare.error as Error).message}</div></div>}
      {compare.data && (
        <div className="compare-grid" aria-labelledby="cmp-h">
          {DELTAS.map((d) => {
            const b = compare.data!.baseline[d.key] ?? 0;
            const s = compare.data!.scenario[d.key] ?? 0;
            const diff = s - b;
            const flat = Math.abs(diff) < (d.digits ? 0.005 : 0.5);
            const favourable = d.favourableWhenNegative === undefined ? undefined : (diff < 0) === d.favourableWhenNegative;
            const tone = flat ? 'neutral' : favourable === undefined ? 'neutral' : favourable ? 'favourable' : 'adverse';
            const show = (n: number): string => (d.money ? fmtMoney(n) : fmt(n, d.digits));
            return (
              <div className="compare-cell" key={d.key}>
                <div className="cc-k">{d.label}</div>
                <div className="cc-pair"><span className="cc-b">{show(b)}</span><span className="cc-arrow" aria-hidden="true">→</span><span className="cc-s">{show(s)}</span></div>
                <div className="cc-d">
                  <span className={'trend ' + tone}>
                    {!flat && <Icon name={diff > 0 ? 'upRight' : 'downRight'} />}
                    {flat ? 'No change' : (diff > 0 ? '+' : '') + (d.money ? fmtMoney(diff) : fmt(diff, d.digits))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="alert info" role="note" style={{ marginTop: 20 }}>
        <Icon name="info" />
        <div className="a-body">A scenario is a copy-on-write overlay resolved at read time. The baseline is byte-for-byte unchanged; these deltas never touched a baseline record.</div>
      </div>
    </div>
  );
}
