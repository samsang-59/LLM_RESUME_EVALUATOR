// The auth doors (doc 09). The only doors in the whole API open to somebody without
// an access token - which is precisely what they are for.
//
// refresh and logout (Phase 7) take no JWT either: the refresh token in the body IS
// their credential, and the access token may well have expired by the time they run.
const express = require('express');
const validate = require('../middlewares/validate');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} = require('../validators/authValidator');
const authController = require('../controllers/authController');

const router = express.Router();

// Register, and be logged in already - the response carries the token (doc 09).
router.post('/register', validate.body(registerSchema), authController.register);

// Log in to an existing account.
router.post('/login', validate.body(loginSchema), authController.login);

// Trade a refresh token for a new pair; the one presented is spent (rotation).
router.post('/refresh', validate.body(refreshTokenSchema), authController.refresh);

// Revoke a refresh token - the server-side half of logging out.
router.post('/logout', validate.body(refreshTokenSchema), authController.logout);

module.exports = router;
