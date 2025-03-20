const express = require("express");
const bibleController = require("../controllers/bible");

const router = express.Router();

// ✅ Route to get all Bibles (Requires authentication)
router.get("/", bibleController.list);
router.get("/:bibleId", bibleController.getById);

module.exports = router;
