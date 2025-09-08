const {
    sendError,
    sendSuccess,
} = require("../../utils/methods");


let latestVideoId = "defaultVideoID"; // Temporary storage (no database)

// Get the latest worship video ID
exports.getLatestWorship = async (req, res, io) => {
  if (!latestVideoId) {
    return sendError(res, "No active worship livestream.", 404);
  }

  // ✅ Emit event if it's not the default video
  if (latestVideoId !== "defaultVideoID") {
    io.emit("online_streaming_is_active", { videoId: latestVideoId });
  }

  return sendSuccess(res, { videoId: latestVideoId });
};


// Update the latest worship video ID (called by the host)
exports.updateLatestWorship = async (req, res, io) => {
  try {
    const { videoId } = req.body;

    if (!videoId) {
      console.error("❌ updateLatestWorship called without videoId");
      return sendError(res, "Video ID is required.", 400);
    }

    latestVideoId = videoId;
    console.log("✅ latestVideoId updated to:", latestVideoId);

    if (latestVideoId !== "defaultVideoID") {
      io.emit("online_streaming_is_active", { videoId: latestVideoId });
    } else {
      io.emit("online_streaming_stopped", { videoId: latestVideoId });
    }

    return sendSuccess(res, { videoId }); // MUST resolve
  } catch (err) {
    console.error("🔥 Error in updateLatestWorship:", err);
    return sendError(res, "Internal Server Error", 500);
  }
};



