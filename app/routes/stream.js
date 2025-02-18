const express = require("express");
const router = express.Router();
const streamController = require("../controllers/stream");

module.exports = (io) => {
    // Initialize WebRTC signaling
    streamController.handleWebRTCSignaling(io);

    // Start Mediasoup Worker & Router
    // router.get("/start", streamController.initializeMediasoup);

    // Create WebRTC Transport (Producer/Consumer)
    router.post("/create-transport", streamController.createTransport);

    // Connect WebRTC Transport
    router.post("/connect-transport", streamController.connectTransport);

    // Start Producing (Streaming)
    router.post("/produce", streamController.produce);

    // Start Consuming (Viewing)
    router.post("/consume", streamController.consume);

    // Stop Streaming
    router.post("/stop", streamController.stopStream);

    // Check stream status
    router.get("/status", streamController.checkStreamStatus);

    return router;
};
