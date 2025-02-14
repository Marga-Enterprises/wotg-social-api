const { spawn } = require("child_process");
const {
    sendError,
    sendSuccess
} = require("../../utils/methods");

const RTMP_SERVER = "rtmp://live.wotgonline.com/live/teststream";
let ffmpegProcess = null;

// **Start Streaming**
exports.startStream = async (req, res, io) => {
    try {
        if (ffmpegProcess) {
            return sendError(res, null, "Stream is already running.");
        }

        console.log("Starting FFmpeg stream...");

        ffmpegProcess = spawn("ffmpeg", [
            "-i", "pipe:0", // Input from WebRTC
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
            "-f", "flv",
            RTMP_SERVER,
        ]);

        ffmpegProcess.stderr.on("data", (data) => {
            console.log(`FFmpeg: ${data}`);
        });

        ffmpegProcess.on("close", () => {
            console.log("FFmpeg process stopped.");
            ffmpegProcess = null;
        });

        // Emit event to notify frontend that streaming has started
        if (io) {
            io.emit("stream_status", { status: "started" });
        }

        return sendSuccess(res, { message: "Streaming started." });
    } catch (error) {
        console.error("Error starting stream:", error);
        return sendError(res, error, "Failed to start streaming.");
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
