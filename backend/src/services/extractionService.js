// STEP 2 of the pipeline: text -> structured resume. LLM call #1 of 2 (doc 06).
//
// This is the only place the raw resume text ever reaches a model. Everything
// downstream works on the clean lists this step produces - which is precisely the
// prompt-injection shield: malicious prose in the resume is stripped here and
// never travels any further.
//
// The four layers of that defense (doc 06), and where each one lives:
//   1. role separation          -> prompts.js (rules in system, resume in user)
//   2. an explicit "data, not instructions" rule -> prompts.js
//   3. structured output        -> llmClient.js (strict JSON schema + local re-check)
//   4. architectural            -> HERE: the LLM only reports facts. The score is
//      computed by scoringService from those facts, so no sentence hidden in a
//      resume can set a score - there is no code path from the text to the number.
const llmClient = require('../llm/llmClient');
const { extractedResumeSchema } = require('../llm/schemas');
const { EXTRACTION_SYSTEM, extractionUser } = require('../llm/prompts');

/** Trim, drop blanks, and remove duplicates that differ only in case or spacing. */
function cleanSkillList(skills) {
  const seen = new Set();
  const out = [];
  for (const skill of skills) {
    const trimmed = String(skill).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Empty strings from the model mean "absent"; store them as null, like the schema says. */
function orNull(value) {
  if (typeof value !== 'string') return value === undefined ? null : value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Read the resume once and get every fact we need out of it.
 *
 * @param {string} resumeText the output of parseService
 * @returns {Promise<{name: string|null, phone: string|null, email: string|null,
 *                    listedSkills: string[], usedSkills: string[],
 *                    totalExperienceYears: number}>}
 * @throws {PipelineError} network / llm_overloaded / malformed_output (from the adapter)
 */
async function extract(resumeText) {
  const answer = await llmClient.complete({
    system: EXTRACTION_SYSTEM,
    user: extractionUser(resumeText),
    schema: extractedResumeSchema,
    schemaName: 'extracted_resume',
  });

  return {
    name: orNull(answer.name),
    phone: orNull(answer.phone),
    email: orNull(answer.email),
    listedSkills: cleanSkillList(answer.listedSkills),
    usedSkills: cleanSkillList(answer.usedSkills),
    totalExperienceYears: answer.totalExperienceYears,
  };
}

module.exports = { extract, cleanSkillList };
