const DEFAULT_RUBRIC = {
  taskCompletion: 30,
  factualAccuracy: 25,
  toneStyleFit: 15,
  responseEfficiency: 10,
  noHallucination: 20,
};

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function weightedScore(scores = {}, rubric = DEFAULT_RUBRIC) {
  let totalWeight = 0;
  let score = 0;

  for (const [key, weight] of Object.entries(rubric)) {
    totalWeight += weight;
    const raw = clampScore(scores[key]);
    score += (raw * weight) / 100;
  }

  if (!totalWeight) return 0;
  return Number(((score / totalWeight) * 100).toFixed(2));
}

function evaluateCase({ transcript = [], kbViolations = [], flags = {} }) {
  const userTurns = transcript.filter((entry) => entry && entry.role === "user");
  const assistantTurns = transcript.filter((entry) => entry && entry.role === "assistant");

  const taskCompletion = userTurns.length > 0 && assistantTurns.length > 0 ? 85 : 40;
  const factualAccuracy = kbViolations.length === 0 ? 100 : Math.max(0, 100 - kbViolations.length * 30);
  const toneStyleFit = flags.toneMismatch ? 60 : 90;
  const responseEfficiency = assistantTurns.length <= userTurns.length + 1 ? 90 : 70;
  const noHallucination = flags.hallucination ? 0 : 100;

  const scores = {
    taskCompletion,
    factualAccuracy,
    toneStyleFit,
    responseEfficiency,
    noHallucination,
  };

  const weighted = weightedScore(scores, DEFAULT_RUBRIC);
  return {
    scores,
    weightedScore: weighted,
    passed: weighted >= 80 && factualAccuracy === 100 && !flags.hallucination,
  };
}

function summarizeIteration(caseResults = []) {
  if (!Array.isArray(caseResults) || caseResults.length === 0) {
    return {
      avgScore: 0,
      passCount: 0,
      totalCount: 0,
      passed: false,
      criticalViolations: ["no_test_results"],
    };
  }

  const totalCount = caseResults.length;
  const passCount = caseResults.filter((item) => item.passed).length;
  const avgScore = Number(
    (
      caseResults.reduce((sum, item) => sum + (Number(item.weightedScore) || 0), 0) /
      totalCount
    ).toFixed(2),
  );

  const criticalViolations = [];
  const hasHallucination = caseResults.some((item) =>
    Array.isArray(item.violations) ? item.violations.includes("hallucination") : false,
  );
  const hasFactualMiss = caseResults.some((item) =>
    Array.isArray(item.violations) ? item.violations.includes("factual_missing") : false,
  );

  if (hasHallucination) criticalViolations.push("hallucination");
  if (hasFactualMiss) criticalViolations.push("factual_missing");
  if (totalCount < 5) criticalViolations.push("insufficient_cases");

  const passed = criticalViolations.length === 0 && avgScore >= 80 && passCount === totalCount;

  return {
    avgScore,
    passCount,
    totalCount,
    passed,
    criticalViolations,
  };
}

module.exports = {
  DEFAULT_RUBRIC,
  weightedScore,
  evaluateCase,
  summarizeIteration,
};
