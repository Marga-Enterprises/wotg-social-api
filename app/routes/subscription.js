const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware"); // ✅ Import authentication middleware
const subscriptionController = require("../controllers/subscription"); // Import the subscription controller

const router = express.Router();

// Apply `authMiddleware` to all routes in this file
router.use(authMiddleware);

// Subscription Routes (Protected)
router.post("/subscribe", subscriptionController.subscribe);
router.delete("/unsubscribe/:subscriptionId", subscriptionController.unsubscribe); // Using URL parameter for subscription ID

module.exports = router;
