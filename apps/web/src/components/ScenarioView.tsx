import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, fmt, fmtMoney, BASELINE } from '../api.ts';
import type { Scenario } from '../api.ts';

interface Props {
  scenarioId: string;
  scenarios: Scenario[];
  onSelectScenario: (id: string) => void;
}

interface DeltaSpec {
  label: string;
  key: string;
  digits: number;
  money?: boolean;
}

const DELTAS: DeltaSpec[] = [
  { label: 'Headcount', key: 'headcount', digits: 0 },
  { label: 'Loaded cost', key: 'cost', digits: 0, money: true },
  { label: 'Average span', key: 'average_span', digits: 2 },
  { label: 'Layers', key: 'layers', digits: 0 },
];

// Scenario bar: list scenarios, create one, and compare the selected scenario
// against the untouched baseline. The comparison is served by the measure
// engine evaluating the same definitions in both the baseline and the overlay.
export function ScenarioView({ scenarioId, scenarios, onSelectScenario }: Props): JSX.Element {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: (n: string) => api.createScenario(n),
    onSuccess: (res) => {
      setName('');
      qc.invalidateQueries({ queryKey: ['scenarios'] });
      onSelectScenario(res.id);
    },
  });

  const compareId = scenarioId !== BASELINE ? scenarioId : scenarios[0]?.id;
  const compare = useQuery({
    queryKey: ['compare', compareId],
    queryFn: () => api.compare(compareId!),
    enabled: !!compareId,
  });

  return (
    <div className="view">
      <div className="create-row">
        <input
          placeholder="New scenario name, e.g. Consolidate Support functions"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={!name.trim() || create.isPending} onClick={() => create.mutate(name.trim())}>
          {create.isPending ? 'Creating…' : 'Create scenario'}
        </button>
      </div>
      {create.isError && <div className="msg err">{(create.error as Error).message}</div>}

      <div className="scenario-list">
        <div
          className={'scenario-row' + (scenarioId === BASELINE ? ' sel' : '')}
          onClick={() => onSelectScenario(BASELINE)}
          style={{ cursor: 'pointer' }}
        >
          <span className="nm">Baseline</span>
          <span className="tag">live</span>
        </div>
        {scenarios.map((s) => (
          <div
            key={s.id}
            className={'scenario-row' + (scenarioId === s.id ? ' sel' : '')}
            onClick={() => onSelectScenario(s.id)}
            style={{ cursor: 'pointer' }}
          >
            <span className="nm">{s.name}</span>
            <span className="tag">overlay</span>
          </div>
        ))}
      </div>

      <div className="section-title">
        {compareId
          ? 'Baseline versus ' + (scenarios.find((s) => s.id === compareId)?.name ?? 'scenario')
          : 'Comparison'}
      </div>

      {!compareId && (
        <div className="note">Create a scenario to compare a restructure against the baseline.</div>
      )}
      {compare.isLoading && <div className="loading">Comparing…</div>}
      {compare.isError && <div className="msg err">{(compare.error as Error).message}</div>}
      {compare.data && (
        <div className="delta-grid">
          {DELTAS.map((d) => {
            const b = compare.data!.baseline[d.key] ?? 0;
            const s = compare.data!.scenario[d.key] ?? 0;
            const diff = s - b;
            const flat = Math.abs(diff) < (d.digits ? 0.005 : 0.5);
            const cls = flat ? 'flat' : diff > 0 ? 'up' : 'down';
            const show = (n: number): string => (d.money ? fmtMoney(n) : fmt(n, d.digits));
            const sign = diff > 0 ? '+' : '';
            return (
              <div className={'delta' + (d.money ? ' money' : '')} key={d.key}>
                <div className="lbl">{d.label}</div>
                <div className="pair">
                  <span className="b">{show(b)}</span>
                  <span className="arrow">→</span>
                  <span className="s">{show(s)}</span>
                  <span className={'d ' + cls}>
                    {flat ? '—' : sign + (d.money ? fmtMoney(diff) : fmt(diff, d.digits))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="note" style={{ marginTop: 22 }}>
        A scenario is a copy-on-write overlay resolved at read time (INV-5). The baseline is
        byte-for-byte unchanged; these deltas never touched a baseline table.
      </div>
    </div>
  );
}
