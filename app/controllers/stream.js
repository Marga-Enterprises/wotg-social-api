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

        // **Check if HLS directory exists**
        if (!fs.existsSync(HLS_OUTPUT_DIR)) {
            console.log(`⚠️ HLS directory not found. Creating: ${HLS_OUTPUT_DIR}`);
            fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
        } else {
            console.log(`✅ HLS directory exists: ${HLS_OUTPUT_DIR}`);
        }

        // **FFmpeg Command to Process WebRTC Stream and Save as HLS**
        ffmpegProcess = spawn("ffmpeg", [
            "-f", "webm",  // WebRTC format
            "-i", "pipe:0", // Read input from stdin
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-b:v", "3000k",
            "-maxrate", "3000k",
            "-bufsize", "6000k",
            "-pix_fmt", "yuv420p",
            "-g", "60",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",

            // HLS Output
            "-f", "hls",
            "-hls_time", "3",
            "-hls_list_size", "10",
            "-hls_flags", "delete_segments",
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

        // **Check if .ts files are being created**
        setTimeout(() => {
            const files = fs.readdirSync(HLS_OUTPUT_DIR);
            if (files.length > 0) {
                console.log(`✅ HLS files detected: ${files}`);
            } else {
                console.log("❌ No HLS segments found! FFmpeg may not be writing .ts files.");
            }
        }, 5000); // Check after 5 seconds

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
