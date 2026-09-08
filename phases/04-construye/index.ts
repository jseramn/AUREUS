export {
  runQualityGate,
  formatQualityGate,
  nextVersionMeetsFloor,
  checkScaffoldResidue,
  checkNoInternalLeakage,
  checkUnboundBusiness,
  checkSvgPercentPaths,
  SCAFFOLD_RESIDUE_REGISTRY,
} from "./quality-gate.js";
export type {
  QualityGateResult,
  QualityCheck,
  ScaffoldResidueEntry,
} from "./quality-gate.js";
