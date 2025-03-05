const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware"); // ✅ Import authentication middleware
const worshipController = require("../controllers/worship");

const router = express.Router();

// Apply `authMiddleware` to all routes in this file
// router.use(authMiddleware);

// Worship Routes (Protected)
router.get("/", worshipController.getLatestWorship);
router.post("/", worshipController.updateLatestWorship);

module.exports = router;
