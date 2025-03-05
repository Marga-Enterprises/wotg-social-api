const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware"); // ✅ Import authentication middleware
const userController = require("../controllers/user"); // Import the user controller

const router = express.Router();

// Apply `authMiddleware` to all routes in this file
// router.use(authMiddleware);

// User Routes (Protected)
router.get("/", userController.list);
router.put("/:id", userController.update);
router.get("/:id", userController.get);

module.exports = router;
