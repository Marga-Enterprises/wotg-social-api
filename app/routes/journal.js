// routes/journal.js
const express = require("express");
const journalController = require("../controllers/journal");

const router = express.Router();

// ✅ List journals of the current user (with pagination and caching)
router.get("/", journalController.list);

// ✅ Create a journal
router.post("/", journalController.create);

// ✅ Get journal by ID
router.get("/:id", journalController.getById);

// ✅ Update journal
router.put("/:id", journalController.update);

// ✅ Delete journal
router.delete("/:id", journalController.delete);

module.exports = router;
