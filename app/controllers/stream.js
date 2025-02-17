const mediasoup = require("mediasoup");

let worker, router;
const transports = [];
const producers = [];
const consumers = [];

// ✅ Initialize Mediasoup Worker & Router
exports.initializeMediasoup = async function () {
    worker = await mediasoup.createWorker();
    router = await worker.createRouter({
        mediaCodecs: [
            { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
            { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 }
        ]
    });

    console.log("✅ Mediasoup Worker & Router created!");
};

// ✅ API: Get RTP Capabilities
exports.getRtpCapabilities = async function (req, res) {
    if (!router) {
        return res.status(500).json({ success: false, message: "Mediasoup Router not initialized." });
    }

    return res.json({ success: true, rtpCapabilities: router.rtpCapabilities });
};

// ✅ API: Start WebRTC Stream
exports.startStream = async function (req, res, io) {
    try {
        console.log("🚀 Starting WebRTC Stream...");
        io.emit("stream_status", { status: "started" });

        return res.json({ success: true, message: "🎥 WebRTC Streaming started!" });
    } catch (error) {
        console.error("❌ Error starting stream:", error);
        return res.status(500).json({ success: false, message: "Failed to start streaming." });
    }
};

// ✅ API: Stop WebRTC Stream
exports.stopStream = async function (req, res, io) {
    try {
        console.log("🛑 Stopping WebRTC Stream...");
        producers.forEach(p => p.close());
        consumers.forEach(c => c.close());
        transports.forEach(t => t.close());

        io.emit("stream_status", { status: "stopped" });

        return res.json({ success: true, message: "✅ Streaming stopped." });
    } catch (error) {
        console.error("❌ Error stopping stream:", error);
        return res.status(500).json({ success: false, message: "Failed to stop streaming." });
    }
};

// ✅ Create Producer Transport (Broadcaster)
exports.createProducerTransport = async function (req, res) {
    try {
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.PUBLIC_IP || "auto" }],
            enableUdp: true,
            enableTcp: true,
        });

        transports.push(transport);

        return res.json({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    } catch (error) {
        console.error("❌ Error creating producer transport:", error);
        return res.status(500).json({ success: false, message: "Failed to create transport." });
    }
};

// ✅ Connect Producer Transport
exports.connectProducerTransport = async function (req, res) {
    const { dtlsParameters } = req.body;
    const transport = transports.find(t => t.id === req.body.transportId);

    if (!transport) return res.status(400).json({ success: false, message: "Transport not found" });

    await transport.connect({ dtlsParameters });

    return res.json({ success: true });
};

// ✅ Produce Media
exports.produce = async function (req, res) {
    try {
        const { kind, rtpParameters, transportId } = req.body;
        const transport = transports.find(t => t.id === transportId);

        if (!transport) return res.status(400).json({ success: false, message: "Transport not found" });

        const producer = await transport.produce({ kind, rtpParameters });
        producers.push(producer);

        return res.json({ id: producer.id });
    } catch (error) {
        console.error("❌ Error producing stream:", error);
        return res.status(500).json({ success: false, message: "Failed to produce media." });
    }
};

// ✅ Create Consumer Transport (Viewer)
exports.createConsumerTransport = async function (req, res) {
    try {
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.PUBLIC_IP || "auto" }],
            enableUdp: true,
            enableTcp: true,
        });

        transports.push(transport);

        return res.json({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        });
    } catch (error) {
        console.error("❌ Error creating consumer transport:", error);
        return res.status(500).json({ success: false, message: "Failed to create transport." });
    }
};

// ✅ Connect Consumer Transport
exports.connectConsumerTransport = async function (req, res) {
    const { dtlsParameters } = req.body;
    const transport = transports.find(t => t.id === req.body.transportId);

    if (!transport) return res.status(400).json({ success: false, message: "Transport not found" });

    await transport.connect({ dtlsParameters });

    return res.json({ success: true });
};

// ✅ Consume Stream (Viewer)
exports.consume = async function (req, res) {
    if (!producers.length) return res.status(400).json({ success: false, message: "No active producer" });

    const transport = transports.find(t => t.id === req.body.transportId);
    if (!transport || !router.canConsume({ producerId: producers[0].id, rtpCapabilities: req.body.rtpCapabilities })) {
        return res.status(400).json({ success: false, message: "Cannot consume" });
    }

    const consumer = await transport.consume({
        producerId: producers[0].id,
        rtpCapabilities: req.body.rtpCapabilities,
        paused: false
    });

    consumers.push(consumer);

    return res.json({
        id: consumer.id,
        producerId: producers[0].id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
    });
};

exports.handleWebRTCSignaling = function (io) {
    io.on("connection", (socket) => {
        console.log(`📡 WebRTC User connected: ${socket.id}`);

        socket.on("getRtpCapabilities", (callback) => {
            callback(router.rtpCapabilities);
        });

        socket.on("disconnect", () => {
            console.log(`📴 WebRTC User disconnected: ${socket.id}`);
        });
    });
};
