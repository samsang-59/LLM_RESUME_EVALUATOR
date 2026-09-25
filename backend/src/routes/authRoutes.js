// The two auth doors (doc 09). The only doors in the whole API open to somebody who
// cannot yet prove who they are - which is precisely what they are for.
const express = require('express');
const validate = require('../middlewares/validate');
const { registerSchema, loginSchema } = require('../validators/authValidator');
const authController = require('../controllers/authController');

const router = express.Router();

// Register, and be logged in already - the response carries the token (doc 09).
router.post('/register', validate.body(registerSchema), authController.register);

// Log in to an existing account.
router.post('/login', validate.body(loginSchema), authController.login);

module.exports = router;
