// notification routes
const express = require('express');
const notificationController = require('../controllers/notification');
const router = express.Router();

router.get('/', notificationController.list);

module.exports = router;

