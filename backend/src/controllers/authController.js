// Thin traffic layer (doc 05): validated request in, service call, response out.
const authService = require('../services/authService');

/**
 * POST /api/auth/register -> 201 + { token, refreshToken, user }
 *
 * 201, and a token: the account is created AND the caller is logged in (doc 09).
 * A 409 for an email that is taken comes from the service, through the central
 * error handler.
 */
async function register(req, res) {
  const result = await authService.register(req.valid.body);
  res.status(201).json(result);
}

/** POST /api/auth/login -> 200 + { token, refreshToken, user } (the 401 comes from the service) */
async function login(req, res) {
  const result = await authService.login(req.valid.body);
  res.status(200).json(result);
}

/** POST /api/auth/refresh -> 200 + a NEW { token, refreshToken, user }; the old refresh token is spent */
async function refresh(req, res) {
  const result = await authService.refresh(req.valid.body.refreshToken);
  res.status(200).json(result);
}

/** POST /api/auth/logout -> 204, whether or not the token was still live */
async function logout(req, res) {
  await authService.logout(req.valid.body.refreshToken);
  res.status(204).end();
}

module.exports = { register, login, refresh, logout };
