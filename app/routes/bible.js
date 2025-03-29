const express = require("express");
const bibleController = require("../controllers/bible");

const router = express.Router();

// ✅ Route to get all Bibles (Requires authentication)
router.get("/", bibleController.list);
// router.post("/translate", bibleController.translate);
// router.post("/generate-commentaries", bibleController.generateAndAddCommentary);
// router.post("/generate-commentaries-gemini", bibleController.generateAndAddCommentaryGemini);

module.exports = router;
