// The guards on every evaluation door.
//
// Guard 1 from doc 04 - the resume submission door - plus the Phase 4 read doors:
// the :id path check and the three list filters.
//
// Everything here is SHAPE AND RULES only. Whether the job exists is a database
// lookup, and that belongs to the service (doc 04/05). What this guard buys us is
// that a bad submission is refused before the pipeline starts, which means before
// two paid LLM calls happen.
const { z } = require('zod');
const config = require('../config/env');
const { detectFileType } = require('../utils/fileType');

const MAX_BYTES = config.maxResumeSizeMb * 1024 * 1024;

/**
 * The file itself, judged by its bytes.
 *
 * Note what the transform returns, and what it does NOT: the uploaded filename is
 * dropped right here and never travels further. Names like `../../config` are an
 * attempt to escape our upload folder, so the stored copy gets a name we generate
 * instead (utils/fileStorage). The uploaded name is not sanitised - it is discarded,
 * which is the only version of that rule with no edge cases.
 */
const resumeFileSchema = z
  .any()
  .superRefine((file, ctx) => {
    const issue = (message) => ctx.addIssue({ code: 'custom', path: ['resume'], message });

    if (!file || !Buffer.isBuffer(file.buffer)) {
      issue('a resume file is required (send it as the "resume" field)');
      return;
    }
    if (file.size === 0) {
      issue('the uploaded file is empty');
      return;
    }
    // multer already rejects an oversized upload; this is the same rule stated where
    // the guard lives, so the limit still holds if the plumbing is ever replaced.
    if (file.size > MAX_BYTES) {
      issue(`the resume must be at most ${config.maxResumeSizeMb} MB`);
      return;
    }
    // The important one. A browser will happily send Content-Type: application/pdf
    // for a renamed .exe, and the extension is whatever the uploader typed. Only the
    // content is trustworthy, so only the content is consulted.
    if (!detectFileType(file.buffer)) {
      issue('the file must really be a PDF or DOCX (checked by its content, not its name)');
    }
  })
  .transform((file) => ({
    buffer: file.buffer,
    size: file.size,
    kind: detectFileType(file.buffer),
  }));

/**
 * The rest of the submission. callbackUrl is where we POST the outcome once the
 * background run finishes (doc 05), so it is required and must be a real URL.
 *
 * Parked for Phase 7 (doc 04): https-only, and blocking internal addresses so this
 * cannot be pointed at 169.254.169.254 or localhost - the SSRF hardening.
 */
const submitEvaluationSchema = z.object({
  callbackUrl: z
    .string({ error: 'callbackUrl is required' })
    .trim()
    .min(1, 'callbackUrl is required')
    .refine((value) => {
      let url;
      try {
        url = new URL(value);
      } catch {
        return false;
      }
      // A "valid URL" for a webhook means one we can POST to. `javascript:` and
      // `file:` parse perfectly well and are not that.
      return url.protocol === 'http:' || url.protocol === 'https:';
    }, 'callbackUrl must be a valid http(s) URL'),
});

/* ------------------------------------------------------------------ *
 * Phase 4 - the read doors
 * ------------------------------------------------------------------ */

// Path parameter for GET /api/evaluations/:id. Shape only, exactly like jobId:
// a positive whole number, handed on as a Number. Whether that evaluation EXISTS
// is a lookup, and the service does it (doc 04) - which is what keeps a malformed
// id a 400 and an unknown one a 404.
const evaluationIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, 'id must be a positive integer')
    .transform(Number),
});

/**
 * A query-string number. Everything in a URL is text, so the guard's job is to
 * refuse the text that is not a number BEFORE it can reach a SQL comparison - and
 * to hand the service a real Number, not a string that happens to look like one.
 *
 * `Number('')` is 0 and `Number(' ')` is 0, so the empty case is rejected explicitly
 * rather than silently becoming a filter of zero.
 */
function numericFilter(name, { min, max } = {}) {
  let schema = z
    .string({ error: `${name} must be a number` })
    .trim()
    .refine((value) => value !== '' && Number.isFinite(Number(value)), `${name} must be a number`)
    .transform(Number);

  if (min !== undefined) schema = schema.refine((v) => v >= min, `${name} must be at least ${min}`);
  if (max !== undefined) schema = schema.refine((v) => v <= max, `${name} must be at most ${max}`);

  return schema.optional();
}

/**
 * The filters on GET /api/jobs/:jobId/evaluations (doc 07).
 *
 * All three are OPTIONAL, and that is the design: no filters means every candidate
 * evaluated for this job, near-misses included. A filter can only narrow.
 *
 * There is no skill filter, on purpose - an eligible candidate already has the
 * required skills, so it would be redundant, and adding one would drag us into
 * querying the JSON columns that doc 02 chose to keep read-whole.
 */
const listEvaluationsQuerySchema = z.object({
  // Only "true" / "false" (any case). A URL cannot carry a real boolean, but it can
  // carry an unambiguous word, and guessing at "yes" / "1" / "on" would be inventing
  // a contract the frontend never agreed to.
  eligible: z
    .string({ error: "eligible must be 'true' or 'false'" })
    .trim()
    .toLowerCase()
    .refine((v) => v === 'true' || v === 'false', "eligible must be 'true' or 'false'")
    .transform((v) => v === 'true')
    .optional(),

  // The score gate HR is scanning for. Same 0-100 range as a job's cutoff.
  minPercentage: numericFilter('minPercentage', { min: 0, max: 100 }),

  // Years, decimals allowed (1.5), never negative - mirroring the job's field.
  minExperience: numericFilter('minExperience', { min: 0 }),
});

module.exports = {
  resumeFileSchema,
  submitEvaluationSchema,
  evaluationIdParamSchema,
  listEvaluationsQuerySchema,
  MAX_BYTES,
};
