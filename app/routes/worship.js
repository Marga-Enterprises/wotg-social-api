const express = require("express");
const router = express.Router();
const worshipController = require("../controllers/worship");

// API to get the latest worship video ID
router.get("/", worshipController.getLatestWorship);

// API to update the latest worship video ID (only for admin/host)
router.post("/", worshipController.updateLatestWorship);

module.exports = router;
