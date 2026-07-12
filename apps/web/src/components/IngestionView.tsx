import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, fmt } from '../api.ts';
import { Icon } from '../ui.tsx';

const SAMPLE_CSV = `Emp ID,Full Name,Job Title,Reports To,FTE,Annual Salary,Cost Centre
E001,Alex Stone,Chief Executive,,1.0,"£250,000",CC-100
E002,Priya Nair,Chief Technology Officer,E001,100%,180000,CC-200
E003,Sam Okafor,Head of Data,E002,0.8,120000,
E004,Jamie Lee,Data Engineer,E999,1,95000,CC-200
E004,Robin Cole,Data Analyst,E002,1,-5,CC-200`;

const CODE_LABELS: Record<string, string> = {
  duplicate_external_id: 'Duplicate identifier',
  orphan_manager: 'Orphan manager',
  cycle: 'Reporting cycle',
  non_positive_fte: 'Non-positive FTE',
  missing_cost_centre: 'Missing cost centre',
  salary_outlier: 'Salary outlier',
};

export function IngestionView(): JSX.Element {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const analyse = useMutation({ mutationFn: (text: string) => api.analyze(text) });
  const result = analyse.data;
  const scoreTone = result ? (result.validation.score >= 85 ? 'good' : result.validation.score >= 60 ? 'warn' : 'crit') : 'neutral';

  return (
    <div>
      <div className="alert info" role="note" style={{ marginBottom: 16 }}>
        <Icon name="info" />
        <div className="a-body">This is a sample extract. Mapping is proposed by the semantic layer, which composes a constrained mapping and never emits SQL. Nothing is loaded; this is analysis only.</div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (csv.trim()) analyse.mutate(csv); }}>
        <div className="form-field" style={{ maxWidth: 820 }}>
          <label htmlFor="csv-input">Workforce extract (CSV)</label>
          <textarea id="csv-input" value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false}
            aria-describedby="csv-hint" />
          <div className="field-foot">
            <span className="hint" id="csv-hint">Paste a comma-separated extract with a header row.</span>
            <span className="hint tnum">{csv.split('\n').filter((l) => l.trim()).length} lines</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={!csv.trim() || analyse.isPending} aria-busy={analyse.isPending}>
          Analyse extract
        </button>
        <button type="button" className="btn btn-tertiary" onClick={() => setCsv(SAMPLE_CSV)} style={{ marginLeft: 8 }}>Reset to sample</button>
        {analyse.isError && <div className="alert crit" role="alert" style={{ marginTop: 12 }}><Icon name="alert" /><div className="a-body">{(analyse.error as Error).message}</div></div>}
      </form>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div className="bento">
            <section className="card card-pad col-4" aria-labelledby="dq-h">
              <div className="section-h"><h3 id="dq-h">Data quality</h3></div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className="m-value tnum" style={{ color: `var(--${scoreTone === 'neutral' ? 'text' : scoreTone})` }}>{result.validation.score}</span>
                <span className="s-sub">/ 100</span>
              </div>
              <div className="m-foot">{fmt(result.validation.rowCount)} data rows analysed</div>
              <div className="active-filters" style={{ marginTop: 12 }}>
                {Object.entries(result.validation.countsByCode).filter(([, n]) => n > 0).map(([code, n]) => (
                  <span className="tag warn" key={code}>{CODE_LABELS[code] ?? code}: {n}</span>
                ))}
                {result.validation.exceptions.length === 0 && <span className="tag good">No defects found</span>}
              </div>
            </section>

            <section className="card col-7" aria-labelledby="map-h" style={{ gridColumn: 'span 8' }}>
              <div className="card-pad section-h" style={{ borderBottom: '1px solid var(--line)', margin: 0 }}>
                <h3 id="map-h">Proposed column mapping</h3><span className="s-sub">{result.mapping.length} source columns</span>
              </div>
              <div className="table-scroll">
                <table className="data" aria-labelledby="map-h">
                  <thead><tr><th scope="col">Source column</th><th scope="col">Target field</th><th scope="col" className="num">Confidence</th><th scope="col">Rationale</th></tr></thead>
                  <tbody>
                    {result.mapping.map((mp) => (
                      <tr key={mp.sourceColumn}>
                        <td className="cell mono">{mp.sourceColumn}</td>
                        <td className="cell">{mp.targetField ? <span style={{ fontWeight: 600 }}>{mp.targetField}</span> : <span className="tag neutral">Unmapped</span>}</td>
                        <td className="cell num">{fmt(mp.confidence * 100)}%</td>
                        <td className="cell" style={{ color: 'var(--text-2)' }}>{mp.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {result.validation.exceptions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-h"><h3 id="exc-h">Validation exceptions</h3><span className="s-sub">{result.validation.exceptions.length} found</span></div>
              <div className="table-wrap">
                <div className="table-scroll">
                  <table className="data" aria-labelledby="exc-h">
                    <thead><tr><th scope="col">Record</th><th scope="col">Defect</th><th scope="col">Detail</th></tr></thead>
                    <tbody>
                      {result.validation.exceptions.slice(0, 20).map((e, i) => (
                        <tr key={i}>
                          <td className="cell mono">{e.externalId}</td>
                          <td className="cell"><span className="tag warn">{CODE_LABELS[e.code] ?? e.code}</span></td>
                          <td className="cell" style={{ color: 'var(--text-2)' }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
