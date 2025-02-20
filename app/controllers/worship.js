const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");


let latestVideoId = "defaultVideoID"; // Temporary storage (no database)

// Get the latest worship video ID
exports.getLatestWorship = async (req, res) => {
  if (!latestVideoId) {
    return sendError(res, "No active worship livestream.", 404);
  }
  
  return sendSuccess(res, { videoId: latestVideoId });
};

// Update the latest worship video ID (called by the host)
exports.updateLatestWorship = async (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return sendError(res, "Video ID is required.", 400);
  }

  latestVideoId = videoId; // Update the in-memory video ID
  return sendSuccess(res, { videoId });
};
