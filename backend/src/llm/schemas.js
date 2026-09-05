// The shapes the LLM is allowed to answer in (doc 02, section C).
//
// These are not database schemas and not request validators - they are the
// contract for the two LLM calls. They are kept next to the adapter because they
// are sent to the provider as a strict JSON schema AND used to re-check the reply.
const { z } = require('zod');

/* ---------------- LLM call #1: extraction ---------------- */

// A resume genuinely may not state a name, a phone or an email, so these are
// nullable rather than optional: the model must return the key, and say "null"
// when it is absent, instead of quietly omitting it.
const extractedResumeSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),

  // Everything the resume lists in a skills section.
  listedSkills: z.array(z.string()),
  // The subset actually used in projects/experience ("built X using React").
  // Stronger proof than a listed skill (doc 02).
  usedSkills: z.array(z.string()),

  // Totalled from the job dates on the resume. Never negative; decimals expected.
  totalExperienceYears: z.number().min(0),
});

/* ---------------- LLM call #2: skill matching ---------------- */

// One verdict per requirement. `evidence` is the candidate skill the model claims
// satisfies the requirement - our code then checks that this skill really exists
// in the extracted list, which is what stops a hallucinated match (doc 06).
const skillVerdictSchema = z.object({
  requirement: z.string(),
  matched: z.boolean(),
  evidence: z.string().nullable(),
});

const skillMatchSchema = z.object({
  mustHave: z.array(skillVerdictSchema),
  goodToHave: z.array(skillVerdictSchema),
});

module.exports = { extractedResumeSchema, skillVerdictSchema, skillMatchSchema };
