const express = require('express');
const router = express.Router();

module.exports = (io) => {
    const streamController = require('../controllers/stream');

    router.post('/start', (req, res) => streamController.startStream(req, res, io));
    router.post('/stop', (req, res) => streamController.stopStream(req, res, io));
    router.get("/rtpCapabilities", streamController.getRtpCapabilities);

    return router;
};
