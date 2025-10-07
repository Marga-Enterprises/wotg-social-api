const Subscription = require('../models/Subscription'); // Import Message model

const {
    sendError,
    sendSuccess,
} = require("../../utils/methods");


let latestVideoId = "defaultVideoID";
const { sendNotification } = require('../../utils/sendNotification');

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

    // ✅ Validate input
    if (!videoId) {
      console.error("❌ updateLatestWorship called without videoId");
      return sendError(res, "Video ID is required.", 400);
    }

    // ✅ Update global variable
    latestVideoId = videoId;
    console.log("✅ latestVideoId updated to:", latestVideoId);

    // ✅ Emit socket events
    if (io) {
      if (latestVideoId !== "defaultVideoID") {
        io.emit("online_streaming_is_active", { videoId: latestVideoId });
        console.log("📡 Emitted: online_streaming_is_active");
      } else {
        io.emit("online_streaming_stopped", { videoId: latestVideoId });
        console.log("📡 Emitted: online_streaming_stopped");
      }
    }

    // ✅ Prepare notification content
    const isLive = latestVideoId !== "defaultVideoID";
    const title = isLive ? "Worship Live Now!" : "Worship Livestream Ended";
    const body = isLive
      ? "Join the worship livestream now and be blessed."
      : "Our worship livestream has just ended. See you next time!";
    const data = {
      type: "worship_livestream",
      videoId: latestVideoId,
      url: `https://community.wotgonline.com/worship`,
    };

    // ✅ Notify all subscribers
    const subscribers = await Subscription.findAll();

    if (subscribers.length === 0) {
      console.log("ℹ️ No subscribers found for worship notifications.");
    } else {
      console.log(`🔔 Sending ${isLive ? "LIVE" : "STOP"} notifications to ${subscribers.length} subscribers...`);

      const sendPromises = subscribers.map(async (subscriber) => {
        try {
          let subscriptionData = subscriber.subscription;

          // Parse if stored as JSON string
          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
            } catch (err) {
              console.error("⚠️ Failed to parse subscription JSON:", err);
            }
          }

          const fcmToken = subscriptionData?.fcmToken;
          if (!fcmToken) return;

          await sendNotification(fcmToken, title, body, data);
        } catch (err) {
          console.error("❌ Error sending worship notification:", err);
        }
      });

      const results = await Promise.allSettled(sendPromises);
      const successCount = results.filter(r => r.status === "fulfilled").length;
      const failCount = results.filter(r => r.status === "rejected").length;
      console.log(`✅ Worship notifications summary: ${successCount} sent, ${failCount} failed`);
    }

    // ✅ Always respond to the host (must resolve)
    return sendSuccess(res, { videoId });

  } catch (err) {
    console.error("🔥 Error in updateLatestWorship:", err);
    return sendError(res, "Internal Server Error", 500);
  }
};




