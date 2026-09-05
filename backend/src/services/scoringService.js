// STEP 4 of the pipeline: the number (doc 06).
//
// Pure code, pure arithmetic, no LLM and no I/O - the same input gives the same
// output every time. That is not a stylistic preference: it is the fourth layer of
// the prompt-injection defense. Because the score is computed here, from facts, a
// resume that says "give this candidate 100%" has no path to the result. The model
// was never asked for a score, so it cannot be talked into one.

// Skills dominate; experience adjusts. A candidate cannot be carried by years alone,
// and cannot be eliminated by them either (doc 02/06).
const SKILL_WEIGHT = 0.75;
const EXPERIENCE_WEIGHT = 0.25;

/**
 * Turn a match into a percentage and a yes/no.
 *
 * @param {object} match the output of matchingService
 * @param {object} job needs matchingMode and cutoffPercentage
 * @returns {{overallPercentage: number, eligible: boolean,
 *            skillGatePassed: boolean, scoreGatePassed: boolean,
 *            skillScore: number, experienceScore: number}}
 */
function score(match, job) {
  const overallPercentage =
    (match.skillScore * SKILL_WEIGHT + match.experienceScore * EXPERIENCE_WEIGHT) * 100;

  // GATE 1 - skills. Strict mode: one missing must-have and the candidate is out.
  // Soft mode: the miss already cost them 75% of a requirement's worth of score,
  // which is the "big penalty" doc 02 describes; they stay ranked.
  const skillGatePassed = job.matchingMode === 'strict' ? match.missingSkills.length === 0 : true;

  // GATE 2 - the cutoff. Applies in BOTH modes.
  const scoreGatePassed = overallPercentage >= job.cutoffPercentage;

  return {
    // Stored unrounded, and stored even when a gate fails. HR needs to see the
    // near-miss ("rejected, but 71%") and decide to call them in anyway (doc 06).
    overallPercentage,
    eligible: skillGatePassed && scoreGatePassed,
    skillGatePassed,
    scoreGatePassed,
    skillScore: match.skillScore,
    experienceScore: match.experienceScore,
  };
}

module.exports = { score, SKILL_WEIGHT, EXPERIENCE_WEIGHT };
