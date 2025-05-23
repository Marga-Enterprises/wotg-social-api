const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/media');

router.post('/get-presigned-url', mediaController.getPresignedUrl);

module.exports = router;
