// routes/subscription.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user'); // Import the subscription controller

// Route for subscribing a user
router.get('/', userController.list);



module.exports = router;
