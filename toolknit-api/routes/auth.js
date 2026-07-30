const express = require('express');
const router = express.Router();
const { register, login, me, registerValidators, loginValidators } = require('../controllers/authController');
const { registerLimiter, loginLimiter, apiLimiter, strictLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');

router.post('/register', registerLimiter, registerValidators, register);
router.post('/login', loginLimiter, loginValidators, login);
router.get('/me', apiLimiter, requireAuth, me);

module.exports = router;
