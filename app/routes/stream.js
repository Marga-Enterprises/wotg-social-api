const express = require("express");
const router = express.Router();
const streamController = require("../controllers/stream");

module.exports = (io) => {
    // ✅ Initialize Mediasoup when the server starts
    streamController.initializeMediasoup();

    // ✅ Start WebRTC Stream (Broadcaster)
    router.post("/start", (req, res) => streamController.startStream(req, res, io));

    // ✅ Stop WebRTC Stream
    router.post("/stop", (req, res) => streamController.stopStream(req, res, io));

    // ✅ Get RTP Capabilities for WebRTC negotiation
    router.get("/rtpCapabilities", (req, res) => streamController.getRtpCapabilities(req, res));

    // ✅ Create Producer Transport (for Broadcasters)
    router.post("/createProducerTransport", (req, res) => streamController.createProducerTransport(req, res));

    // ✅ Connect Producer Transport
    router.post("/connectProducerTransport", (req, res) => streamController.connectProducerTransport(req, res));

    // ✅ Produce (Start Sending Media)
    router.post("/produce", (req, res) => streamController.produce(req, res));

    // ✅ Create Consumer Transport (for Viewers)
    router.post("/createConsumerTransport", (req, res) => streamController.createConsumerTransport(req, res));

    // ✅ Connect Consumer Transport
    router.post("/connectConsumerTransport", (req, res) => streamController.connectConsumerTransport(req, res));

    // ✅ Consume Stream (Viewers start watching)
    router.post("/consume", (req, res) => streamController.consume(req, res));

    return router;
};
