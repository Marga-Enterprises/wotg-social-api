const mediasoup = require("mediasoup");

let ioInstance = null;
let producer = null;
let worker, router, producerTransport, consumerTransports = [];

// ✅ Initialize WebRTC Worker & Transport
async function createMediasoupWorker() {
    worker = await mediasoup.createWorker();
    router = await worker.createRouter({
        mediaCodecs: [
            { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
            { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 }
        ],
    });
    

    producerTransport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: "145.223.75.230" }],
        enableUdp: true,
        enableTcp: true,
    });

    console.log("✅ WebRTC Server Ready!");
}

// ✅ API: Start WebRTC Stream
exports.startStream = async (req, res, io) => {
    console.log('STEAM STARTED');
    try {
        if (producer) {
            return res.status(400).json({ success: false, message: "Stream is already running." });
        }

        console.log("🚀 Starting WebRTC stream...");
        io.emit("stream_status", { status: "started" });

        return res.json({ success: true, message: "🎥 WebRTC Streaming started!" });
    } catch (error) {
        console.error("❌ Error starting stream:", error);
        return res.status(500).json({ success: false, message: "Failed to start streaming." });
    }
};

exports.getRtpCapabilities = async (req, res) => {
    if (!router) {
        return res.status(500).json({ success: false, message: "Mediasoup Router not initialized." });
    }

    return res.json({ success: true, rtpCapabilities: router.rtpCapabilities });
};


// ✅ API: Stop WebRTC Stream
exports.stopStream = async (req, res, io) => {
    try {
        if (!producer) {
            return res.status(400).json({ success: false, message: "No active stream." });
        }

        console.log("🛑 Stopping WebRTC stream...");
        producer.close();
        producer = null;

        io.emit("stream_status", { status: "stopped" });

        return res.json({ success: true, message: "✅ Streaming stopped." });
    } catch (error) {
        console.error("❌ Error stopping stream:", error);
        return res.status(500).json({ success: false, message: "Failed to stop streaming." });
    }
};

// ✅ WebRTC Signaling (Socket.io) - Use Existing `io` Instance
exports.handleWebRTCSignaling = (io) => {
    ioInstance = io; // ✅ Use existing `io` from `server.js`

    ioInstance.on("connection", (socket) => {
        console.log("🔗 New user connected:", socket.id);

        // ✅ Handle ICE Candidate Exchange
        socket.on("webrtc_ice_candidate", (candidate) => {
            console.log("📡 Received ICE candidate:", candidate);
            socket.broadcast.emit("webrtc_ice_candidate", candidate);
        });

        socket.on("start_webrtc_stream", async ({ rtpParameters }) => {
            console.log("📡 RTP PARAMS RECEIVED:", rtpParameters);
        
            if (!router) {
                console.error("❌ Mediasoup Router not initialized.");
                return;
            }
        
            if (!rtpParameters || !Array.isArray(rtpParameters) || rtpParameters.length === 0) {
                console.error("❌ Invalid rtpParameters received:", rtpParameters);
                return;
            }
        
            try {
                producer = await producerTransport.produce({
                    kind: "video",
                    rtpParameters: rtpParameters[0],
                });
        
                console.log("✅ Producer created, notifying viewers...");
        
                // 🚀 Instead of sending an SDP, notify viewers that streaming is available
                ioInstance.emit("stream_started", { status: "started" });
        
            } catch (error) {
                console.error("❌ Error producing stream:", error);
            }
        });
        
                

        socket.on("join_webrtc_stream", async (data) => {
            if (!producer) {
                console.error("❌ No active producer to consume.");
                return;
            }
        
            try {
                // ✅ Create a consumer WebRTC transport
                const consumerTransport = await router.createWebRtcTransport({
                    listenIps: [{ ip: "0.0.0.0", announcedIp: "145.223.75.230" }],
                    enableUdp: true,
                    enableTcp: true,
                });
        
                // ✅ Create a consumer
                const consumer = await consumerTransport.consume({
                    producerId: producer.id,
                    rtpCapabilities: data.rtpCapabilities, // 👀 Viewer must send rtpCapabilities
                    paused: false
                });
        
                consumerTransports.push(consumerTransport);
        
                console.log("✅ Consumer Transport Created!");
        
                // ✅ Send Transport and Consumer info to Viewer
                socket.emit("consumer_transport_info", {
                    id: consumerTransport.id,
                    iceParameters: consumerTransport.iceParameters,
                    iceCandidates: consumerTransport.iceCandidates,
                    dtlsParameters: consumerTransport.dtlsParameters,
                    rtpParameters: consumer.rtpParameters, // 🚀 Send correct Mediasoup parameters
                });
        
            } catch (error) {
                console.error("❌ Error creating consumer:", error);
            }
        });
        

        socket.on("disconnect", () => {
            console.log("❌ User disconnected:", socket.id);
        });
    });

    createMediasoupWorker();
};

