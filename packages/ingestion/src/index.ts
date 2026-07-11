// @wfb/ingestion: the data-preparation core. Pure, database-free and
// independently testable. It turns a messy human-resources extract into a
// mapped, validated, deduplicated set of canonical rows ready to load through
// the scenario and data-model layers. This package holds no persistence: it is
// the primary product differentiator (Sprint 4 to 5) and is kept isolated so it
// can be exercised without a database.

export { parseCsvStream, sniffDelimiter, type CsvParseOptions } from './csv.js';

export { inferColumnType, type InferredType } from './infer.js';

export {
  proposeMapping,
  overrideProposal,
  saveTemplate,
  applyTemplate,
  mappingAccuracy,
  TARGET_FIELDS,
  type TargetField,
  type MappingProposal,
  type MappingTemplate,
} from './mapping.js';

export {
  validate,
  type CanonicalRow,
  type ValidationReport,
  type ValidationException,
  type ExceptionCode,
  type Severity,
} from './validate.js';

export {
  findDuplicates,
  type MatchKey,
  type Suggestion,
  type ReviewItem,
  type DedupOptions,
} from './dedup.js';

export { normalise, levenshtein, similarity } from './text.js';
