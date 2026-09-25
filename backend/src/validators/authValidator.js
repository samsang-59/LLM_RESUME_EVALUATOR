// Guards on the two auth doors (doc 09).
//
// Shape and rules only, as always: whether the email is already registered is a
// database lookup, and that belongs to the service (doc 04).
const { z } = require('zod');

// bcrypt hashes at most 72 BYTES and silently ignores everything after them - so a
// 100-character password would be validated in full and then quietly truncated,
// and two different long passwords could open the same account. We refuse what we
// cannot honour instead.
const MAX_PASSWORD_BYTES = 72;

/**
 * The login identifier. Trimmed and lower-cased so "HR@Example.com " and
 * "hr@example.com" are one account rather than two - the UNIQUE constraint compares
 * bytes, so the normalising has to happen before the database sees it.
 *
 * Note the order: normalise, THEN check the format. Written the other way round
 * (`z.email().trim()`) the format check would run on the raw input and a padded
 * address would be rejected as invalid rather than tidied up.
 */
const email = z
  .string({ error: 'a valid email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'a valid email is required' }));

const registerSchema = z.object({
  username: z
    .string({ error: 'username must be a string' })
    .trim()
    .min(1, 'username is required'),

  email,

  // Eight characters, and no complexity rules (doc 09's decision 2): length is what
  // actually makes a password hard to guess, and rules about symbols mostly produce
  // "Password1!". NOT trimmed - a space is a character someone may have meant.
  password: z
    .string({ error: 'password must be a string' })
    .min(8, 'password must be at least 8 characters')
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
      `password must be at most ${MAX_PASSWORD_BYTES} bytes`
    ),
});

/**
 * Login checks only that something usable was sent. There is deliberately no
 * minimum length here: an account whose password predates a rule must still be able
 * to log in, and enforcing the register rules on this door would tell an attacker
 * which of their guesses were not even worth trying.
 */
const loginSchema = z.object({
  email,
  password: z.string({ error: 'password must be a string' }).min(1, 'password is required'),
});

module.exports = { registerSchema, loginSchema, MAX_PASSWORD_BYTES };
