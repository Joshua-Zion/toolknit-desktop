const express = require('express');
const router = express.Router();
const { updateProfile, changePassword, incrementUsage, profileValidators, changePasswordValidators } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter, strictLimiter } = require('../middleware/rateLimiter');

router.post('/profile', strictLimiter, requireAuth, profileValidators, updateProfile);
router.post('/change-password', strictLimiter, requireAuth, changePasswordValidators, changePassword);
router.post('/usage/increment', apiLimiter, requireAuth, incrementUsage);

module.exports = router;
