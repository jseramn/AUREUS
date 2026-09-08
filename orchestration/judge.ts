/**
 * Judge port — LLM-as-Judge contract.
 *
 * The concrete implementation is bring-your-own (depends on provider SDK).
 * AUREUS defines the signature and the verdict semantics; the rubric lives
 * in templates/prompts/judge-rubrics/<phase>.md.
 */

export type JudgeVerdict = "advance" | "repair" | "discard" | "human";

export interface JudgeResult {
  score: number; // 0..1
  dimensions: Record<string, number>;
  verdict: JudgeVerdict;
  repairHint: string | null;
}

export interface JudgeInput {
  rubric: string; // contents of the .md rubric, with {{QUALITY_THRESHOLD_LLM_JUDGE}} interpolated
  artifact: string; // the artifact to evaluate
  threshold: number;
}

export type JudgeFn = (input: JudgeInput) => Promise<JudgeResult>;

/**
 * Reference default Judge: a naive heuristic Judge that does NOT call any LLM.
 * Useful for tests and dry-runs. Production replaces this with an LLM-backed fn.
 */
export const heuristicJudge: JudgeFn = async (input): Promise<JudgeResult> => {
  const len = input.artifact.trim().length;
  const score = Math.min(1, len / 4000);
  const verdict: JudgeVerdict = score >= input.threshold ? "advance" : "repair";
  return {
    score,
    dimensions: { length_coverage: score },
    verdict,
    repairHint: verdict === "advance" ? null : "Artefacto demasiado corto o incompleto.",
  };
};

export function interpolateRubric(
  rubricTemplate: string,
  vars: Record<string, string | number>,
): string {
  let out = rubricTemplate;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), String(v));
  }
  return out;
}
