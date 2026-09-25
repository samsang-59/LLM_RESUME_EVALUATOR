// A valid HR token, for the suites whose doors Phase 5 put a guard on.
//
// The token is minted directly rather than by registering through the door, and
// that is legitimate rather than a shortcut: a JWT is stateless (doc 09) - the
// guard verifies a signature and never looks the user up - so a signed token IS
// the credential, with or without a row behind it. The real register/login flow,
// and everything that can go wrong with it, is Phase 5's own test round.
const tokenService = require('../../src/services/tokenService');

const HR_USER = { id: 1, email: 'hr@example.com' };

/** A signed token for an HR user. */
const hrToken = (user = HR_USER) => tokenService.generateToken(user);

/** The header to hang on any HR request: `.set(asHr())`. */
const asHr = (user = HR_USER) => ({ Authorization: `Bearer ${hrToken(user)}` });

module.exports = { asHr, hrToken, HR_USER };
