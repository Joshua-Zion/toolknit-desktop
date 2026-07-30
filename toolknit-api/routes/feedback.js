const express = require('express');
const router = express.Router();
const { submitFeedback, submitValidators } = require('../controllers/feedbackController');
const { strictLimiter } = require('../middleware/rateLimiter');

router.post('/', strictLimiter, submitValidators, submitFeedback);

module.exports = router;
