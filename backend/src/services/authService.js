// The auth logic (doc 09). Two jobs - open an account, and prove you own one - and
// one rule that shapes both: the plain password exists only for the length of the
// request. It is hashed on the way in and compared on the way back; it is never
// stored, never logged, and never returned.
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const refreshTokenRepository = require('../repositories/refreshTokenRepository');
const tokenService = require('./tokenService');
const { generateSecret, hashSecret } = require('../utils/secrets');
const config = require('../config/env');
const { ConflictError, UnauthorizedError } = require('../utils/errors');

/**
 * A real bcrypt hash of a value nobody knows, used only to burn the same time a
 * genuine comparison would when the email does not exist (see login).
 * Generated once at startup, so it costs nothing per request.
 */
const DECOY_HASH = bcrypt.hashSync('no-such-user-password', config.bcryptRounds);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issue a new refresh token for a user and store its hash (Phase 7).
 * The plain token is returned to the caller and is not kept anywhere on our side.
 */
async function issueRefreshToken(userId) {
  const refreshToken = generateSecret();
  await refreshTokenRepository.createRefreshToken({
    userId,
    tokenHash: hashSecret(refreshToken),
    expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * DAY_MS).toISOString(),
  });
  return refreshToken;
}

/**
 * What register, login and refresh all answer with: the pair, and the user WITHOUT
 * the hash.
 *
 *   token         the short access JWT, sent on every HR request
 *   refreshToken  the long revocable one, sent ONLY to /api/auth/refresh and /logout
 *
 * The access token keeps v1's name, `token`, so nothing that read it before breaks.
 */
async function authenticated(user) {
  return {
    token: tokenService.generateToken(user),
    refreshToken: await issueRefreshToken(user.id),
    user,
  };
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

/**
 * Trade a refresh token for a fresh pair (Phase 7). Rotation: the token presented
 * is spent here and a new one is handed back, so each refresh token works ONCE.
 *
 * That once-only rule is what lets us notice theft. If a spent token is presented
 * again, then two parties have held it - the real user and someone who copied it -
 * and we cannot tell which is which. So we revoke every login that user has, and
 * both have to sign in again with the password, which only the real one knows.
 *
 * Every refusal is the same 401 with the same message: unknown, expired, revoked
 * and replayed tokens all look alike from the outside.
 *
 * @param {string} refreshToken
 * @returns {Promise<{token: string, refreshToken: string, user: object}>}
 * @throws {UnauthorizedError}
 */
async function refresh(refreshToken) {
  const refused = () => new UnauthorizedError('Invalid refresh token');

  const stored = await refreshTokenRepository.getRefreshTokenByHash(hashSecret(refreshToken));
  if (!stored) throw refused();

  if (stored.revokedAt) {
    await refreshTokenRepository.revokeAllForUser(stored.userId);
    throw refused();
  }

  if (Date.parse(stored.expiresAt) <= Date.now()) throw refused();

  // Spend it. Only one caller can win this - if two requests raced here with the
  // same token, the loser is treated exactly like a replay.
  const spent = await refreshTokenRepository.revokeRefreshToken(stored.id);
  if (!spent) {
    await refreshTokenRepository.revokeAllForUser(stored.userId);
    throw refused();
  }

  const user = await userRepository.getUserById(stored.userId);
  if (!user) throw refused();

  return authenticated(user);
}

/**
 * Log out: revoke the refresh token so it can never be traded again (Phase 7).
 *
 * Deliberately silent about what it found. An unknown or already-revoked token is
 * not an error - the caller wanted it dead, and it is - and answering differently
 * would let anyone probe which tokens exist. The access JWT cannot be revoked (it
 * is stateless); it simply runs out within its 15 minutes.
 */
async function logout(refreshToken) {
  const stored = await refreshTokenRepository.getRefreshTokenByHash(hashSecret(refreshToken));
  if (stored) await refreshTokenRepository.revokeRefreshToken(stored.id);
}

module.exports = { register, login, refresh, logout };
