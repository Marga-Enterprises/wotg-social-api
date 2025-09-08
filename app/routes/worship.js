const express = require("express");

module.exports = (io) => {
    const router = express.Router();
    const worshipController = require("../controllers/worship");

    // Worship Routes (Protected)
    router.get("/", (req, res) => worshipController.getLatestWorship(req, res, io));
    router.post("/", (req, res) => worshipController.updateLatestWorship(req, res, io));

    return router;
};






