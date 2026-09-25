// The auth logic (doc 09). Two jobs - open an account, and prove you own one - and
// one rule that shapes both: the plain password exists only for the length of the
// request. It is hashed on the way in and compared on the way back; it is never
// stored, never logged, and never returned.
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const tokenService = require('./tokenService');
const config = require('../config/env');
const { ConflictError, UnauthorizedError } = require('../utils/errors');

/**
 * A real bcrypt hash of a value nobody knows, used only to burn the same time a
 * genuine comparison would when the email does not exist (see login).
 * Generated once at startup, so it costs nothing per request.
 */
const DECOY_HASH = bcrypt.hashSync('no-such-user-password', config.bcryptRounds);

/** What both doors answer with: the token, and the user WITHOUT the hash. */
function authenticated(user) {
  return { token: tokenService.generateToken(user), user };
}

/**
 * Register an HR account, and log them straight in (doc 09's decision 1: a signup
 * that immediately makes you sign in again is a worse experience for no security).
 *
 * @param {{username: string, email: string, password: string}} data already validated
 * @returns {Promise<{token: string, user: object}>}
 * @throws {ConflictError} the email is taken -> 409
 */
async function register({ username, email, password }) {
  // The friendly check: it turns a taken email into a clear 409 instead of a
  // database error. It is not the guarantee - two simultaneous registrations can
  // both pass it - and the UNIQUE constraint underneath is what actually holds.
  const existing = await userRepository.getUserByEmail(email);
  if (existing) throw new ConflictError('That email is already registered');

  // bcrypt: one-way and salted. Salted per password, so two people who chose the
  // same password do not get the same hash, and a stolen table cannot be reversed
  // with a precomputed rainbow table. The cost factor is deliberate slowness -
  // it is what makes brute-forcing the hashes expensive.
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  const user = await userRepository.createUser({ username, email, passwordHash });
  return authenticated(user);
}

/**
 * Log in.
 *
 * Both failures - no such email, and the wrong password - answer with the SAME 401
 * and the same message. Saying "no account with that email" would turn this door
 * into a way to discover who has an account here, which is information we have no
 * reason to give out.
 *
 * The message alone is not enough, though: if we returned early when the email is
 * unknown, that answer would come back measurably faster than a wrong password
 * (which pays for a bcrypt comparison), and the timing would leak exactly what the
 * message refuses to say. So an unknown email is compared against a decoy hash and
 * pays the same cost.
 *
 * @throws {UnauthorizedError} either way, indistinguishably
 */
async function login({ email, password }) {
  const user = await userRepository.getUserByEmail(email, { withPasswordHash: true });

  const matches = await bcrypt.compare(password, user ? user.passwordHash : DECOY_HASH);
  if (!user || !matches) throw new UnauthorizedError('Invalid email or password');

  // The hash was needed for that one comparison and for nothing else. It does not
  // travel any further than this line.
  delete user.passwordHash;
  return authenticated(user);
}

module.exports = { register, login };
