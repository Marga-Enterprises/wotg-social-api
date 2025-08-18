const express = require("express");
const subscriptionController = require("../controllers/subscription"); // Import the subscription controller

const router = express.Router();

router.post("/subscribe", subscriptionController.subscribe);
router.delete("/unsubscribe/:subscriptionId", subscriptionController.unsubscribe); 

module.exports = router;
