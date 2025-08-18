const express = require("express");
const userController = require("../controllers/user"); // Import the user controller

const router = express.Router();

router.get("/", userController.list);
router.put("/:id", userController.update);
router.get("/:id", userController.get);

module.exports = router;
