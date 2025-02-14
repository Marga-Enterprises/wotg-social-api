const { spawn } = require("child_process");
const fs = require("fs");

const HLS_OUTPUT_DIR = "/var/www/html/hls/";
const HLS_PLAYLIST = `${HLS_OUTPUT_DIR}teststream.m3u8`;

let ffmpegProcess = null;

// **Start Streaming**
exports.startStream = async (req, res, io) => {
    try {
        if (ffmpegProcess) {
            console.log("⚠️ Stream is already running.");
            return res.status(400).json({ success: false, message: "Stream is already running." });
        }

        console.log("🚀 Starting FFmpeg stream...");

        // **Ensure HLS directory exists**
        if (!fs.existsSync(HLS_OUTPUT_DIR)) {
            console.log(`⚠️ HLS directory not found. Creating: ${HLS_OUTPUT_DIR}`);
            fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
        } else {
            console.log(`✅ HLS directory exists: ${HLS_OUTPUT_DIR}`);
        }

        // **FFmpeg Real-Time Optimized Command**
        ffmpegProcess = spawn("ffmpeg", [
            "-re",  // Real-time processing
            "-f", "webm",  // WebRTC format
            "-i", "pipe:0", // Read input from stdin

            // **Video Optimization**
            "-c:v", "libx264", // Efficient encoding
            "-preset", "ultrafast", // Fastest encoding
            "-tune", "zerolatency", // Low latency tuning
            "-b:v", "2500k", // Bitrate
            "-maxrate", "2500k",
            "-bufsize", "5000k",
            "-pix_fmt", "yuv420p",
            "-g", "30", // GOP size (lower = lower latency)
            "-r", "30", // Frame rate

            // **Audio Optimization**
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-ac", "2",

            // **HLS Real-Time Streaming Output**
            "-f", "hls",
            "-hls_time", "1",          // Lower segment time for real-time streaming
            "-hls_list_size", "5",     // Keep last 5 segments (faster updates)
            "-hls_flags", "delete_segments+append_list", // Keep appending new segments
            "-hls_segment_type", "mpegts", // Ensures compatibility
            "-hls_allow_cache", "0",  // No caching (reduces delay)
            "-hls_segment_filename", `${HLS_OUTPUT_DIR}segment-%03d.ts`,
            HLS_PLAYLIST
        ]);

        console.log("🎥 FFmpeg started, waiting for WebRTC video input...");

        ffmpegProcess.stderr.on("data", (data) => {
            console.log(`FFmpeg Log: ${data}`);
        });

        ffmpegProcess.on("close", () => {
            console.log("⚠️ FFmpeg process stopped.");
            ffmpegProcess = null;
        });

        // **Emit real-time stream status**
        io.emit("stream_status", { status: "started" });

        return res.json({ success: true, message: "🎥 Streaming started!" });
    } catch (error) {
        console.error("❌ Error starting stream:", error);
        return res.status(500).json({ success: false, message: "Failed to start streaming." });
    }
};

// **Handle WebRTC Video Stream from Frontend**
exports.handleWebRTCStream = (socket) => {
    socket.on("stream_data", (data) => {
        if (ffmpegProcess) {
            console.log(`📡 Receiving WebRTC stream data (${data.length} bytes)`);
            ffmpegProcess.stdin.write(data); // Send video data to FFmpeg
        } else {
            console.log("❌ No active FFmpeg process to handle WebRTC data.");
        }
    });
};

// **Stop Streaming**
exports.stopStream = async (req, res, io) => {
    try {
        if (!ffmpegProcess) {
            console.log("❌ No active stream to stop.");
            return res.status(400).json({ success: false, message: "No active stream." });
        }

        console.log("🛑 Stopping FFmpeg stream...");
        ffmpegProcess.stdin.end();
        ffmpegProcess.kill("SIGINT");
        ffmpegProcess = null;

        io.emit("stream_status", { status: "stopped" });

        return res.json({ success: true, message: "✅ Streaming stopped." });
    } catch (error) {
        console.error("❌ Error stopping stream:", error);
        return res.status(500).json({ success: false, message: "Failed to stop streaming." });
    }
};
