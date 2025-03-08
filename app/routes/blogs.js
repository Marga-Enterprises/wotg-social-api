const express = require("express");

const blogsController = require("../controllers/blogs");

const router = express.Router();

// Blog Routes
router.get("/", blogsController.list);
router.get("/:id", blogsController.getById);

module.exports = router;