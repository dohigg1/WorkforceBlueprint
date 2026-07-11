export {
  BASELINE_SCENARIO,
  type ClosureRow,
  rebuildClosure,
  descendants,
  ancestors,
  subtree,
  depthOf,
} from './closure.js';
export { CycleError, wouldCreateCycle, setReportingLine } from './cycle.js';
