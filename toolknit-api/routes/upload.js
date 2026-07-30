const express = require('express');
const router = express.Router();
const { uploadAvatar } = require('../middleware/upload');
const { uploadAvatar: handleUpload } = require('../controllers/uploadController');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.post('/avatar', uploadLimiter, requireAuth, uploadAvatar, handleUpload);

module.exports = router;
