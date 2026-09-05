// Guard 2 from doc 04 - the HR job input, plus the :jobId path check.
//
// These check SHAPE AND RULES only. Whether a job actually exists in the DB is a
// lookup, and that belongs to the service (doc 04/05).
const { z } = require('zod');

// A skill is text. "Web3" and "ES6" are valid - we ban the wrong TYPE, not digits.
const skill = z
  .string({ error: 'each skill must be a string' })
  .trim()
  .min(1, 'each skill must be a non-empty string');

const createJobSchema = z.object({
  // Required, non-empty, and a string. Digits inside are fine ("Backend Developer 2026").
  title: z
    .string({ error: 'title must be a string' })
    .trim()
    .min(1, 'title is required'),

  // Mandatory skills. At least one - a job with zero requirements cannot be matched.
  mustHaveSkills: z
    .array(skill, { error: 'mustHaveSkills must be an array of strings' })
    .min(1, 'at least one must-have skill is required'),

  // Bonus only, so an empty list is valid, and it defaults to empty when omitted.
  goodToHaveSkills: z
    .array(skill, { error: 'goodToHaveSkills must be an array of strings' })
    .default([]),

  // Numeric, decimals allowed (1.5 yrs), never negative, defaults to 0.
  // z.number() already rejects NaN and Infinity, so no extra finite check is needed.
  requiredExperienceYears: z
    .number({ error: 'requiredExperienceYears must be a number' })
    .min(0, 'requiredExperienceYears cannot be negative')
    .default(0),

  // The enum - exactly these two values, nothing else.
  matchingMode: z.enum(['strict', 'soft'], {
    error: "matchingMode must be either 'strict' or 'soft'",
  }),

  // The score gate, per job.
  cutoffPercentage: z
    .number({ error: 'cutoffPercentage must be a number' })
    .min(0, 'cutoffPercentage must be between 0 and 100')
    .max(100, 'cutoffPercentage must be between 0 and 100'),
});

// Path parameter: shape only. A positive whole number, handed on as a Number.
const jobIdParamSchema = z.object({
  jobId: z
    .string()
    .regex(/^[1-9]\d*$/, 'jobId must be a positive integer')
    .transform(Number),
});

module.exports = { createJobSchema, jobIdParamSchema };
