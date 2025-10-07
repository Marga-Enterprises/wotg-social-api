const admin = require("../firebase"); // Firebase Admin SDK

/**
 * Sends a push notification via Firebase Cloud Messaging.
 * @param {string} fcmToken - The recipient's FCM token.
 * @param {string} title - The title of the notification.
 * @param {string} body - The body text of the notification.
 * @param {object} [data={}] - Optional data payload (e.g., { url: "https://..." }).
 */
exports.sendNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.warn("⚠️ No FCM token provided, skipping push.");
    return;
  }

  const message = {
    token: fcmToken,
    notification: {
      title: title || "WOTG Community",
      body: body || "",
    },
    data: {
      // 🔗 Attach extra payload for click redirection
      ...data,
      click_action: "FLUTTER_NOTIFICATION_CLICK", // needed for Android auto-open
    },
    android: {
      notification: {
        channelId: "wotg_default_channel", // Make sure channel exists in your app
        tag: data?.type || "general",      // 🔥 Prevent duplicate identical pushes
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          category: data?.type || "general",
        },
      },
    },
    collapseKey: data?.type || "general", // ✅ Collapses similar notifications
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`✅ Push sent to ${fcmToken.slice(0, 10)}...`, response);
    return response;
  } catch (error) {
    console.error("❌ Error sending notification:", error);
  }
};
