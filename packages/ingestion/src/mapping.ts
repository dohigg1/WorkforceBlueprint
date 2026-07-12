// Column mapping. For every source column in an uploaded extract we propose a
// target canonical field, with a confidence score and a plain-English
// explanation of why. The incumbent's evidenced weakness is the data
// preparation burden, so this surface is treated as a first-class product
// feature, not a utility.
//
// This is deterministic and DB-free: it uses a synonym dictionary, normalised
// token overlap and edit-distance fuzz. In production the semantic tool layer
// (packages/ai) may refine low-confidence proposals, but the heuristic here is
// self-sufficient and testable in isolation, and every proposal is overridable.

import { normalise, tokenise, similarity, tokenF1 } from './text.js';

/**
 * The canonical target fields an extract can be mapped onto. These mirror the
 * client-supplied logical fields of the positions and people model
 * (packages/data-model), which reference one another by external_id. The
 * hierarchy is a hierarchy of positions, so `external_id` is the position key
 * and `manager_external_id` is the parent position, never a person.
 */
export type TargetField =
  | 'external_id'
  | 'title'
  | 'grade'
  | 'fte'
  | 'status'
  | 'cost_centre_external_id'
  | 'location_external_id'
  | 'org_unit_external_id'
  | 'manager_external_id'
  | 'person_external_id'
  | 'person_name'
  | 'email'
  | 'base_salary';

export const TARGET_FIELDS: readonly TargetField[] = [
  'external_id',
  'title',
  'grade',
  'fte',
  'status',
  'cost_centre_external_id',
  'location_external_id',
  'org_unit_external_id',
  'manager_external_id',
  'person_external_id',
  'person_name',
  'email',
  'base_salary',
];

export interface MappingProposal {
  /** The source column header exactly as it appeared in the file. */
  readonly sourceColumn: string;
  /** The proposed canonical field, or null when nothing matched confidently. */
  readonly targetField: TargetField | null;
  /** Confidence in the range 0..1. */
  readonly confidence: number;
  /** Plain-English reason a consultant can read and trust. */
  readonly explanation: string;
}

export interface MappingTemplate {
  readonly name: string;
  readonly version: 1;
  /** Chosen mapping from source column to target field, null meaning ignore. */
  readonly entries: ReadonlyArray<{ readonly sourceColumn: string; readonly targetField: TargetField | null }>;
}

// The synonym dictionary. Each phrase is matched after normalisation. Phrases
// are ordered from most to least specific only for readability; scoring does
// not depend on their order. The dictionary is deliberately opinionated about
// awkward real-world abbreviations: PERNR (SAP personnel number), Cost Ctr,
// FTE%, Emp Grp and the like.
const SYNONYMS: Record<TargetField, readonly string[]> = {
  external_id: [
    'position id',
    'position number',
    'position code',
    'position external id',
    'pos id',
    'posn id',
    'posid',
    'seat id',
    'position',
    'external id',
    'req id',
    'requisition id',
  ],
  title: [
    'position title local',
    'position title',
    'job title',
    'role title',
    'position name',
    'designation',
    'title',
    'job description',
  ],
  grade: ['grade', 'pay grade', 'job grade', 'grade band', 'band', 'pay band', 'career level', 'job level'],
  fte: ['fte', 'full time equivalent', 'fte ratio', 'fte pct', 'fte percent', 'contracted fte', 'working time'],
  status: [
    'status',
    'position status',
    'employee status',
    'employment status',
    'emp status',
    'staff status',
    'employee group',
    'emp grp',
    'employee grp',
    'occupancy status',
  ],
  cost_centre_external_id: [
    'cost centre',
    'cost center',
    'cost ctr',
    'cost centre id',
    'cost centre code',
    'costcentre',
    'cc code',
    'cost centre external id',
  ],
  location_external_id: [
    'location',
    'work location',
    'location id',
    'location code',
    'site',
    'work site',
    'office',
    'geography',
    'location external id',
  ],
  org_unit_external_id: [
    'org unit',
    'organisational unit',
    'organizational unit',
    'org unit id',
    'org unit code',
    'orgunit',
    'department',
    'dept',
    'division',
    'business unit',
    'org external id',
  ],
  manager_external_id: [
    'manager pernr',
    'mgr pernr',
    'manager id',
    'manager external id',
    'manager position',
    'manager',
    'mgr',
    'mgr id',
    'reports to',
    'line manager',
    'supervisor',
    'parent position',
    'parent position id',
  ],
  person_external_id: [
    'employee id',
    'emp id',
    'employee number',
    'emp no',
    'pernr',
    'personnel number',
    'staff id',
    'person id',
    'worker id',
    'badge id',
    'person external id',
  ],
  person_name: [
    'employee name',
    'person name',
    'full name',
    'worker name',
    'staff name',
    'display name',
    'name',
    'incumbent',
    'incumbent name',
  ],
  email: [
    'employee email address',
    'employee email',
    'work email',
    'email address',
    'e mail',
    'email',
    'mail',
    'contact email',
  ],
  base_salary: [
    'annual base salary',
    'annual base sal',
    'base salary',
    'basic salary',
    'base sal',
    'base pay',
    'annual salary',
    'annual base',
    'salary',
    'remuneration',
    'compensation',
  ],
};

// A confidence floor below which we propose nothing rather than guess. Wrong
// confident guesses are worse than an honest "unmapped" a consultant can set.
const CONFIDENCE_FLOOR = 0.4;

interface FieldScore {
  readonly field: TargetField;
  readonly confidence: number;
  readonly matchedSynonym: string;
  readonly method: 'exact' | 'tokens' | 'fuzzy';
}

function scoreField(headerNorm: string, headerTokens: string[], field: TargetField): FieldScore {
  let best: FieldScore = { field, confidence: 0, matchedSynonym: '', method: 'fuzzy' };
  for (const synonym of SYNONYMS[field]) {
    const synNorm = normalise(synonym);
    if (headerNorm === synNorm) {
      return { field, confidence: 1, matchedSynonym: synonym, method: 'exact' };
    }
    const synTokens = tokenise(synonym);
    const f1 = tokenF1(headerTokens, synTokens);
    const strSim = similarity(headerNorm, synNorm);
    // Token overlap is the stronger signal for multi-word headers; string
    // similarity catches single-token near-misses such as centre/center.
    const combined = Math.max(f1 * 0.97, strSim * 0.9);
    const method: FieldScore['method'] = f1 >= strSim ? 'tokens' : 'fuzzy';
    if (combined > best.confidence) {
      best = { field, confidence: combined, matchedSynonym: synonym, method };
    }
  }
  return best;
}

function explain(source: string, best: FieldScore): string {
  if (best.confidence <= 0 || best.matchedSynonym === '') {
    return `No confident canonical field matched the column "${source}". Please map it by hand.`;
  }
  const pct = Math.round(best.confidence * 100);
  switch (best.method) {
    case 'exact':
      return `The column "${source}" matches the known name "${best.matchedSynonym}" exactly, so it maps to ${best.field} (confidence ${pct} per cent).`;
    case 'tokens':
      return `The words in "${source}" overlap the known name "${best.matchedSynonym}", so it maps to ${best.field} (confidence ${pct} per cent).`;
    default:
      return `The column "${source}" is spelled close to the known name "${best.matchedSynonym}", so it maps to ${best.field} (confidence ${pct} per cent).`;
  }
}

/**
 * Propose a canonical target field for every source header. The `sample`
 * argument is accepted so that value-shape evidence can inform ambiguous
 * headers in future; the current heuristic is header-driven, which is already
 * sufficient for the awkward-header target, and is kept deterministic. Every
 * proposal is overridable through {@link overrideProposal}.
 */
export function proposeMapping(
  headers: string[],
  sample: Record<string, string[]> = {},
): MappingProposal[] {
  // The sample is reserved for value-shape evidence on ambiguous headers. The
  // heuristic is header-driven today, which already meets the accuracy target.
  void sample;
  return headers.map((header) => {
    const headerNorm = normalise(header);
    const headerTokens = tokenise(header);

    let best: FieldScore | null = null;
    for (const field of TARGET_FIELDS) {
      const score = scoreField(headerNorm, headerTokens, field);
      if (best === null || score.confidence > best.confidence) best = score;
    }

    if (best === null || best.confidence < CONFIDENCE_FLOOR) {
      return {
        sourceColumn: header,
        targetField: null,
        confidence: best ? Number(best.confidence.toFixed(3)) : 0,
        explanation: explain(header, best ?? { field: 'external_id', confidence: 0, matchedSynonym: '', method: 'fuzzy' }),
      };
    }

    return {
      sourceColumn: header,
      targetField: best.field,
      confidence: Number(best.confidence.toFixed(3)),
      explanation: explain(header, best),
    };
  });
}

/**
 * Override a single proposal, for example when a consultant corrects the
 * machine. Returns a new proposal at full confidence attributed to the human.
 */
export function overrideProposal(
  proposal: MappingProposal,
  targetField: TargetField | null,
): MappingProposal {
  return {
    sourceColumn: proposal.sourceColumn,
    targetField,
    confidence: 1,
    explanation:
      targetField === null
        ? `The column "${proposal.sourceColumn}" was set to unmapped by hand.`
        : `The column "${proposal.sourceColumn}" was mapped to ${targetField} by hand.`,
  };
}

/** Save a chosen set of proposals as a reusable, named template. */
export function saveTemplate(name: string, proposals: MappingProposal[]): MappingTemplate {
  return {
    name,
    version: 1,
    entries: proposals.map((p) => ({ sourceColumn: p.sourceColumn, targetField: p.targetField })),
  };
}

/**
 * Apply a saved template to a fresh set of headers. Columns named in the
 * template take its mapping at full confidence; unknown columns fall back to a
 * fresh proposal so a slightly changed extract still gets sensible defaults.
 */
export function applyTemplate(
  template: MappingTemplate,
  headers: string[],
  sample: Record<string, string[]> = {},
): MappingProposal[] {
  const byColumn = new Map<string, TargetField | null>();
  for (const entry of template.entries) byColumn.set(entry.sourceColumn, entry.targetField);

  const fresh = proposeMapping(headers, sample);
  return headers.map((header, i) => {
    if (byColumn.has(header)) {
      const targetField = byColumn.get(header) ?? null;
      return {
        sourceColumn: header,
        targetField,
        confidence: 1,
        explanation:
          targetField === null
            ? `The column "${header}" is ignored by template "${template.name}".`
            : `The column "${header}" maps to ${targetField} from template "${template.name}".`,
      };
    }
    return fresh[i] ?? {
      sourceColumn: header,
      targetField: null,
      confidence: 0,
      explanation: `No confident canonical field matched the column "${header}". Please map it by hand.`,
    };
  });
}

/**
 * Measure mapping accuracy against a known-correct expectation: the fraction of
 * expected fields that were proposed correctly. Reported as a number so the
 * epic's eighty-per-cent target can be asserted.
 */
export function mappingAccuracy(
  proposals: MappingProposal[],
  expected: Record<string, TargetField | null>,
): { correct: number; total: number; accuracy: number } {
  const byColumn = new Map<string, TargetField | null>();
  for (const p of proposals) byColumn.set(p.sourceColumn, p.targetField);

  const entries = Object.entries(expected);
  let correct = 0;
  for (const [source, want] of entries) {
    if ((byColumn.get(source) ?? null) === want) correct++;
  }
  const total = entries.length;
  return { correct, total, accuracy: total === 0 ? 0 : correct / total };
}
