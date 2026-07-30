const express = require('express');
const router = express.Router();
const { incrementGlobalUsage, getGlobalUsage } = require('../controllers/usageController');
const { apiLimiter, strictLimiter } = require('../middleware/rateLimiter');

router.post('/increment', strictLimiter, incrementGlobalUsage);
router.get('/total', apiLimiter, getGlobalUsage);

module.exports = router;
