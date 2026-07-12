export {
  type CostConfig,
  setCostConfig,
  setGradeMidpoint,
  setFxRate,
} from './config.js';
export { type CostBreakdown, decomposeCost } from './decompose.js';
export {
  type SeveranceConfig,
  type SeveranceResult,
  type CostOutResult,
  setSeveranceConfig,
  computeSeverance,
  costOut,
} from './severance.js';
