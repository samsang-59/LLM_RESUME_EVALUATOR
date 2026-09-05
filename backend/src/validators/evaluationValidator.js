// Guard 1 from doc 04 - the resume submission door.
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

module.exports = { resumeFileSchema, submitEvaluationSchema, MAX_BYTES };
