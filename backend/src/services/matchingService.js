// STEP 3 of the pipeline: does this candidate meet the job's requirements? (doc 06)
//
// The rule that shapes this whole file: **LLM for words, code for numbers.**
//
//   SKILLS     need meaning - "Express" satisfies "Node.js backend", and no string
//              comparison will ever see that. So the LLM judges. (LLM call #2 of 2.)
//   EXPERIENCE is arithmetic. 4 years versus 3 required needs no intelligence, so
//              code does it. Sending it to a model would be slower, dearer and less
//              reliable than a division.
//
// Two safeguards sit around the LLM's judgement:
//
//   * WHAT IT SEES - only the clean skill lists from extraction, never the raw
//     resume. The injection shield from step 2 stays intact: prose that could carry
//     an instruction was already thrown away.
//   * WHAT IT SAYS - every claimed match must name a candidate skill as evidence,
//     and code checks that skill really exists in the extracted list. A match whose
//     evidence was invented is dropped. We still trust the model's SEMANTIC verdict
//     (that is the part only it can do); we do not trust it about facts we hold.
const llmClient = require('../llm/llmClient');
const { skillMatchSchema } = require('../llm/schemas');
const { MATCHING_SYSTEM, matchingUser } = require('../llm/prompts');

/** Skill names are compared case- and spacing-insensitively; nothing else is normalised. */
const key = (skill) => String(skill).trim().toLowerCase();

/**
 * Everything the candidate can offer, as one list.
 * usedSkills is the stronger proof (doc 02), but a listed skill still counts as a
 * skill - the distinction is kept on the resume record for HR, not applied here.
 */
function candidateSkills(extracted) {
  const seen = new Set();
  const out = [];
  for (const skill of [...extracted.usedSkills, ...extracted.listedSkills]) {
    const k = key(skill);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(skill).trim());
  }
  return out;
}

/**
 * Keep only the verdicts we can stand behind.
 *
 * A verdict survives when it is marked matched AND its evidence is a skill the
 * candidate actually has. Anything else - no evidence, or evidence that appears
 * nowhere in the extracted list - is a hallucination and is rejected, which turns
 * the requirement back into a miss.
 */
function verifyVerdicts(verdicts, requirements, availableKeys) {
  // The model answers about the requirements we sent; ignore anything else it
  // volunteers, and judge each requirement by OUR list, not by its reply.
  const byRequirement = new Map();
  for (const verdict of verdicts) byRequirement.set(key(verdict.requirement), verdict);

  const matched = [];
  const missing = [];
  const evidenceUsed = [];

  for (const requirement of requirements) {
    const verdict = byRequirement.get(key(requirement));
    const evidence = verdict && verdict.evidence ? String(verdict.evidence).trim() : '';
    const grounded = evidence !== '' && availableKeys.has(key(evidence));

    if (verdict && verdict.matched && grounded) {
      matched.push(requirement);
      evidenceUsed.push(evidence);
    } else {
      missing.push(requirement);
    }
  }

  return { matched, missing, evidenceUsed };
}

/**
 * Experience, in code. Closeness rather than a cutoff, so being a little short
 * costs a little score instead of eliminating anybody (doc 02: experience never
 * eliminates). Required 0 means the job does not care, so everyone gets full credit.
 */
function experienceScore(candidateYears, requiredYears) {
  if (!(requiredYears > 0)) return 1;
  return Math.min(candidateYears / requiredYears, 1);
}

/**
 * Match one extracted resume against one job.
 *
 * @param {object} extracted the output of extractionService
 * @param {object} job the job row (mustHaveSkills, goodToHaveSkills, requiredExperienceYears)
 * @returns {Promise<{matchedRequiredSkills: string[], missingSkills: string[],
 *                    matchedGoodToHaveSkills: string[], extraSkills: string[],
 *                    candidateExperienceYears: number, requiredExperienceYears: number,
 *                    skillScore: number, experienceScore: number}>}
 * @throws {PipelineError} network / llm_overloaded / malformed_output (from the adapter)
 */
async function match(extracted, job) {
  const skills = candidateSkills(extracted);
  const availableKeys = new Set(skills.map(key));

  const answer = await llmClient.complete({
    system: MATCHING_SYSTEM,
    user: matchingUser({
      mustHaveSkills: job.mustHaveSkills,
      goodToHaveSkills: job.goodToHaveSkills,
      candidateSkills: skills,
    }),
    schema: skillMatchSchema,
    schemaName: 'skill_match',
  });

  const must = verifyVerdicts(answer.mustHave, job.mustHaveSkills, availableKeys);
  const good = verifyVerdicts(answer.goodToHave, job.goodToHaveSkills, availableKeys);

  // "Extra" = everything the candidate brings that was not needed to satisfy a
  // must-have. That deliberately includes the skills matching a good-to-have: the
  // schema has no separate column for them (doc 02), and this is where HR sees them
  // - recorded as a human tiebreaker, exactly as doc 06 asks, and never scored.
  const spentOnMustHaves = new Set(must.evidenceUsed.map(key));
  const extraSkills = skills.filter((skill) => !spentOnMustHaves.has(key(skill)));

  return {
    matchedRequiredSkills: must.matched,
    missingSkills: must.missing,
    matchedGoodToHaveSkills: good.matched,
    extraSkills,

    candidateExperienceYears: extracted.totalExperienceYears,
    requiredExperienceYears: job.requiredExperienceYears,

    // Only must-haves feed the score (doc 06). A job always has at least one
    // (the validator and the DB both enforce it), so this never divides by zero.
    skillScore: job.mustHaveSkills.length ? must.matched.length / job.mustHaveSkills.length : 1,
    experienceScore: experienceScore(extracted.totalExperienceYears, job.requiredExperienceYears),
  };
}

module.exports = { match, verifyVerdicts, experienceScore, candidateSkills };
