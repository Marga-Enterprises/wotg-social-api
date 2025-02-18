const mediasoup = require("mediasoup");

let worker, router, producerTransport, consumerTransports = [], producer;

const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

/**
 * ✅ Initialize Mediasoup Worker & Router
 */
exports.initializeMediasoup = async (req, res) => {
    try {
        if (!worker) {
            worker = await mediasoup.createWorker();
            router = await worker.createRouter({
                mediaCodecs: [
                    { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
                    { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
                ],
            });
            // console.log("✅ Mediasoup Worker & Router Initialized.");
        }
        // return sendSuccess(res, "Mediasoup initialized");
        console.log("✅ Mediasoup Worker & Router Initialized.");
    } catch (error) {
        console.error("❌ Error initializing Mediasoup:", error);
        // return sendError(res, "Error initializing Mediasoup", error);
    }
};

/**
 * ✅ Create WebRTC Transport (Producer/Consumer)
 */
exports.createTransport = async (req, res) => {
    console.log('CREATE TRANSPORT TRIGGERED');
    try {
        let token = getToken(req.headers);
        if (!token) return sendErrorUnauthorized(res, "Unauthorized request. Token is missing.");

        if (!router) {
            return sendError(res, "Mediasoup router is not initialized.");
        }

        const { role } = req.body;

        // ✅ Create WebRTC Transport with ICE Servers
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.PUBLIC_IP }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            enableSctp: true, // ✅ Enable SCTP (for WebRTC DataChannel support)
            iceServers: [
                { urls: "stun:meet.wotgonline.com:3478" }, // ✅ Use Jitsi's STUN
                { 
                    urls: "turns:meet.wotgonline.com:5349", 
                    username: "webrtcuser", 
                    credential: "securepassword" 
                } // ✅ Use Jitsi's TURN for relay
            ],
        });

        if (role === "producer") producerTransport = transport;
        else consumerTransports.push(transport);

        console.log("✅ Transport Created:", transport.id);

        // ✅ Merge Transport Info & RTP Capabilities in Response
        return sendSuccess(res, {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            rtpCapabilities: router.rtpCapabilities, // ✅ Include rtpCapabilities
        }, "Transport created with RTP Capabilities");

    } catch (error) {
        console.error("❌ Error creating transport:", error);
        return sendError(res, "Error creating transport", error);
    }
};


/**
 * ✅ Connect WebRTC Transport (Used by Producer & Consumer)
 */
exports.connectTransport = async (req, res) => {
    try {
        let token = getToken(req.headers);
        if (!token) return sendErrorUnauthorized(res, "Unauthorized request. Token is missing.");

        const { dtlsParameters, role } = req.body;
        if (role === "producer") await producerTransport.connect({ dtlsParameters });
        else {
            const consumerTransport = consumerTransports.find(t => t.id === transport.id);
            if (consumerTransport) await consumerTransport.connect({ dtlsParameters });
        }
        return sendSuccess(res, "Transport connected");
    } catch (error) {
        console.error("❌ Error connecting transport:", error);
        return sendError(res, "Error connecting transport", error);
    }
};

/**
 * ✅ Start Producing Stream
 */
exports.produce = async (req, res) => {
    try {
        let token = getToken(req.headers);
        if (!token) return sendErrorUnauthorized(res, "Unauthorized request. Token is missing.");

        const { kind, rtpParameters } = req.body;

        if (!rtpParameters || !rtpParameters.codecs) {
            return sendError(res, "Error producing stream", "Missing rtpParameters.codecs");
        }

        if (!rtpParameters.encodings || !rtpParameters.encodings[0].ssrc) {
            return sendError(res, "Error producing stream", "Missing ssrc in encodings");
        }

        if (!producerTransport) {
            return sendError(res, "Error producing stream", "Producer transport not initialized");
        }

        const producer = await producerTransport.produce({ kind, rtpParameters });

        console.log(`🚀 Producer Created - ID: ${producer.id} | Kind: ${kind}`);

        // ✅ Store the producer in global state
        if (kind === "video") {
            global.videoProducer = producer;
            console.log("✅ GLOBAL VIDEO PRODUCER SET:", global.videoProducer.id);
        } else if (kind === "audio") {
            global.audioProducer = producer;
            console.log("✅ GLOBAL AUDIO PRODUCER SET:", global.audioProducer.id);
        }

        return sendSuccess(res, { id: producer.id }, "Stream started successfully");
    } catch (error) {
        console.error("❌ Error producing stream:", error);
        return sendError(res, "Error producing stream", error.message);
    }
};



exports.stopStream = async (req, res) => {
    try {
        let token = getToken(req.headers);
        if (!token) return sendErrorUnauthorized(res, "Unauthorized request. Token is missing.");

        // ✅ Close existing producers if they exist
        if (global.videoProducer) {
            console.log("🔴 Stopping video producer...");
            await global.videoProducer.close();
            global.videoProducer = null;
        }

        if (global.audioProducer) {
            console.log("🔴 Stopping audio producer...");
            await global.audioProducer.close();
            global.audioProducer = null;
        }

        // ✅ Close transport (VERY IMPORTANT)
        if (producerTransport) {
            console.log("🔴 Closing transport...");
            await producerTransport.close();
            producerTransport = null;
        }

        return sendSuccess(res, null, "Stream stopped successfully");
    } catch (error) {
        console.error("❌ Error stopping stream:", error);
        return sendError(res, "Error stopping stream", error.message);
    }
};


/**
 * ✅ Start Consuming Stream (Viewer)
 */
exports.consume = async (req, res) => {
    try {
        let token = getToken(req.headers);
        if (!token) return sendErrorUnauthorized(res, "Unauthorized request. Token is missing.");

        // ✅ Check if a video producer exists
        if (!global.videoProducer) {
            console.warn("⚠ No active video producer found!");
            return sendSuccess(res, { isLive: false }, "No live stream available.");
        }

        console.log("✅ Consuming Stream from Producer:", global.videoProducer.id);

        const { rtpCapabilities, dtlsParameters } = req.body;

        if (!rtpCapabilities) {
            return sendError(res, "Missing RTP capabilities.", null);
        }

        if (!dtlsParameters || !dtlsParameters.fingerprints) {
            return sendError(res, "Missing DTLS parameters.", null);
        }

        console.log('RTP CAPABILITIES:', rtpCapabilities);
        console.log('DTLS PARAMETERS:', dtlsParameters);

        // ✅ Ensure router can consume
        if (!router.canConsume({ producerId: global.videoProducer.id, rtpCapabilities })) {
            return sendError(res, "Cannot consume stream. Invalid RTP capabilities.", null);
        }

        // ✅ Create a transport for this viewer
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.PUBLIC_IP }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        consumerTransports.push(transport);

        // ✅ Connect transport only if dtlsParameters are valid
        await transport.connect({ dtlsParameters });

        // ✅ Create consumer
        const consumer = await transport.consume({
            producerId: global.videoProducer.id,
            rtpCapabilities,
            paused: false,
        });

        console.log(`✅ Consumer Created - ID: ${consumer.id}`);

        return sendSuccess(res, {
            id: consumer.id,
            producerId: global.videoProducer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
        }, "Stream consumption started");
    } catch (error) {
        console.error("❌ Error consuming stream:", error);
        return sendError(res, "Error consuming stream", error.message);
    }
};




exports.checkStreamStatus = async (req, res) => {
    try {
        if (!global.videoProducer) {
            return sendSuccess(res, { isLive: false }, "No live stream available.");
        }

        return sendSuccess(res, { 
            isLive: true, 
            rtpCapabilities: router.rtpCapabilities // ✅ Include rtpCapabilities
        }, "Live stream is active.");
    } catch (error) {
        console.error("❌ Error checking stream status:", error);
        return sendError(res, "Error checking stream status", error.message);
    }
};



/**
 * ✅ WebRTC Signaling via Socket.io
 */
exports.handleWebRTCSignaling = (io) => {
    io.on("connection", (socket) => {
        console.log(`🔵 WebRTC Client connected: ${socket.id}`);

        socket.on("disconnect", () => {
            console.log(`🔴 WebRTC Client disconnected: ${socket.id}`);
            consumerTransports = consumerTransports.filter(t => t.socket.id !== socket.id);
        });
    });
};
