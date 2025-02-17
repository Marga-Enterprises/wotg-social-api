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
            "-re",
            "-f", "webm",
            "-i", "pipe:0",
        
            // ✅ Optimized Video Encoding for Stability
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-b:v", "2500k",
            "-maxrate", "2500k",
            "-bufsize", "5000k", // ✅ Increased buffer size for stability
            "-pix_fmt", "yuv420p",
            "-g", "60",  // ✅ Higher GOP for smooth playback (~2s latency)
            "-r", "30",
        
            // ✅ Optimized Audio Processing
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-ac", "2",
        
            // ✅ HLS Output with 2-Second Latency
            "-f", "hls",
            "-hls_time", "1",        // ✅ Each segment is 1 second (total ~2s latency)
            "-hls_list_size", "6",   // ✅ Keep last 6 segments to ensure smooth playback
            "-hls_flags", "delete_segments+append_list+independent_segments",
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_allow_cache", "0",
            "-hls_segment_filename", `${HLS_OUTPUT_DIR}segment-%03d.m4s`,
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
