const { spawn } = require("child_process");
const {
    sendError,
    sendSuccess
} = require("../../utils/methods");

const fs = require("fs");

const RTMP_SERVER = "rtmp://live.wotgonline.com/live/teststream";
const HLS_PATH = "/var/www/html/hls/teststream.m3u8";
let ffmpegProcess = null;

// **Start Streaming**
exports.startStream = async (req, res, io) => {
    try {
        if (ffmpegProcess) {
            return res.status(400).json({ success: false, message: "Stream is already running." });
        }

        console.log("Starting FFmpeg stream...");

        // Ensure HLS directory exists
        if (!fs.existsSync("/var/www/html/hls")) {
            fs.mkdirSync("/var/www/html/hls", { recursive: true });
        }

        ffmpegProcess = spawn("ffmpeg", [
            "-i", "pipe:0",  // Change this if WebRTC isn't working. Try a test video instead.
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
            "-f", "flv", RTMP_SERVER,  // RTMP Stream

            // HLS Output
            "-f", "hls",
            "-hls_time", "3",           // 3-second segments
            "-hls_list_size", "10",      // Keep last 10 segments in the playlist
            "-hls_flags", "delete_segments", // Delete old segments to avoid memory issues
            "-hls_segment_filename", "/var/www/html/hls/segment-%03d.ts",
            HLS_PATH
        ]);

        ffmpegProcess.stderr.on("data", (data) => {
            console.log(`FFmpeg: ${data}`);
        });

        ffmpegProcess.on("close", () => {
            console.log("FFmpeg process stopped.");
            ffmpegProcess = null;
        });

        io.emit("stream_status", { status: "started" });

        return res.json({ success: true, message: "Streaming started!" });
    } catch (error) {
        console.error("Error starting stream:", error);
        return res.status(500).json({ success: false, message: "Failed to start streaming." });
    }
};

// **Stop Streaming**
exports.stopStream = async (req, res, io) => {
    try {
        if (!ffmpegProcess) {
            return sendError(res, null, "No active stream.");
        }

        console.log("Stopping FFmpeg stream...");
        ffmpegProcess.stdin.end();
        ffmpegProcess.kill();
        ffmpegProcess = null;

        // Emit event to notify frontend that streaming has stopped
        if (io) {
            io.emit("stream_status", { status: "stopped" });
        }

        return sendSuccess(res, { message: "Streaming stopped." });
    } catch (error) {
        console.error("Error stopping stream:", error);
        return sendError(res, error, "Failed to stop streaming.");
    }
};
