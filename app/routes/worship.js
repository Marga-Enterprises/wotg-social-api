const express = require("express");
const worshipController = require("../controllers/worship");

const router = express.Router();

// Worship Routes (Protected)
router.get("/", worshipController.getLatestWorship);
router.post("/", worshipController.updateLatestWorship);

module.exports = router;
