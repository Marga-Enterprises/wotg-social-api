const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const streamController = require('../controllers/stream'); // Import controller

    router.post('/start', (req, res) => streamController.startStream(req, res, io));
    router.post('/stop', (req, res) => streamController.stopStream(req, res, io)); // ✅ Corrected this line

    return router;
};
