// Guards on the ATS-client doors (Phase 7). Shape and rules only, as always.
const { z } = require('zod');

/** Creating a client: just a name to recognise it by, e.g. "Company A". */
const createAtsClientSchema = z.object({
  name: z
    .string({ error: 'name must be a string' })
    .trim()
    .min(1, 'name is required')
    .max(100, 'name must be at most 100 characters'),
});

/** Path parameter: a positive whole number, handed on as a Number. */
const atsClientIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/, 'id must be a positive integer')
    .transform(Number),
});

module.exports = { createAtsClientSchema, atsClientIdParamSchema };
