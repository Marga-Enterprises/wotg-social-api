// routes/subscription.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription'); // Import the subscription controller

// Route for subscribing a user
router.post('/subscribe', subscriptionController.subscribe);

// Route for unsubscribing a user
router.delete('/unsubscribe/:subscriptionId', subscriptionController.unsubscribe);  // Using URL parameter for subscription ID


module.exports = router;
