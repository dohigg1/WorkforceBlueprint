import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, fmt } from '../api.ts';

const SAMPLE_CSV = `Emp ID,Full Name,Job Title,Reports To,FTE,Annual Salary,Cost Centre
E001,Alex Stone,Chief Executive,,1.0,"£250,000",CC-100
E002,Priya Nair,Chief Technology Officer,E001,100%,180000,CC-200
E003,Sam Okafor,Head of Data,E002,0.8,120000,
E004,Jamie Lee,Data Engineer,E999,1,95000,CC-200
E004,Robin Cole,Data Analyst,E002,1,-5,CC-200`;

const CODE_LABELS: Record<string, string> = {
  duplicate_external_id: 'Duplicate id',
  orphan_manager: 'Orphan manager',
  cycle: 'Cycle',
  non_positive_fte: 'Non-positive FTE',
  missing_cost_centre: 'Missing cost centre',
  salary_outlier: 'Salary outlier',
};

// Ingestion panel: paste an awkward extract, run the AI mapping proposal and
// advisory validation. The language model composes a constrained mapping; it
// never emits SQL (INV-8). Nothing is loaded here; this is analysis only.
export function IngestionView(): JSX.Element {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const analyse = useMutation({ mutationFn: (text: string) => api.analyze(text) });

  const result = analyse.data;
  const scoreClass =
    result && result.validation.score >= 85 ? 'good' : result && result.validation.score >= 60 ? 'warn' : 'crit';

  return (
    <div className="view">
      <div className="ingest-grid">
        <div>
          <div className="section-title" style={{ margin: '0 0 10px' }}>
            Paste an HR extract
          </div>
          <textarea className="csv" value={csv} onChange={(e) => setCsv(e.target.value)} />
          <button
            className="btn"
            style={{ marginTop: 12 }}
            disabled={!csv.trim() || analyse.isPending}
            onClick={() => analyse.mutate(csv)}
          >
            {analyse.isPending ? 'Analysing…' : 'Analyse'}
          </button>
          {analyse.isError && <div className="msg err">{(analyse.error as Error).message}</div>}
        </div>

        {result && (
          <>
            <div>
              <div className="section-title" style={{ margin: '0 0 10px' }}>
                Proposed column mapping
              </div>
              <div className="canvas-shell" style={{ background: 'var(--panel)' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Source column</th>
                      <th>Target field</th>
                      <th style={{ textAlign: 'right' }}>Confidence</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.mapping.map((m) => (
                      <tr key={m.sourceColumn}>
                        <td className="mono">{m.sourceColumn}</td>
                        <td>
                          <span className="arrow-map">→</span>
                          <span className={'target' + (m.targetField ? '' : ' none')}>
                            {m.targetField ?? 'unmapped'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="conf">{fmt(m.confidence * 100)}%</span>
                        </td>
                        <td style={{ color: 'var(--muted)' }}>{m.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="section-title" style={{ margin: '0 0 10px' }}>
                Validation
              </div>
              <div className="kpi">
                <div className="score-ring">
                  <div className={'score-num ' + scoreClass}>{result.validation.score}</div>
                  <div>
                    <div className="lbl">Data quality score / 100</div>
                    <div className="sub">{fmt(result.validation.rowCount)} data rows analysed</div>
                  </div>
                </div>
                <div className="defects">
                  {Object.entries(result.validation.countsByCode)
                    .filter(([, n]) => n > 0)
                    .map(([code, n]) => (
                      <span className="defect" key={code}>
                        {CODE_LABELS[code] ?? code} <b>{n}</b>
                      </span>
                    ))}
                  {result.validation.exceptions.length === 0 && (
                    <span className="defect">No defects found</span>
                  )}
                </div>
              </div>
              {result.validation.exceptions.length > 0 && (
                <div className="canvas-shell" style={{ background: 'var(--panel)', marginTop: 12 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Row id</th>
                        <th>Defect</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.validation.exceptions.slice(0, 20).map((e, i) => (
                        <tr key={i}>
                          <td className="mono">{e.externalId}</td>
                          <td>{CODE_LABELS[e.code] ?? e.code}</td>
                          <td style={{ color: 'var(--muted)' }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
