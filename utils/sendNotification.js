/**
 * 🔥 sendNotification Utility
 * Sends push notifications via Firebase Admin SDK
 * Supports Android heads-up display + Chrome web push
 */

const admin = require("../firebase"); // adjust path if needed

/**
 * Sends a push notification using Firebase Cloud Messaging.
 *
 * @param {string} fcmToken - Target user's FCM registration token
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {object} [data={}] - Custom data payload (e.g. { url, chatroomId, type })
 * @returns {Promise<object|null>} FCM response or null on failure
 */
exports.sendNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.warn("⚠️ No FCM token provided — skipping notification.");
    return null;
  }

  try {
    const url = data?.url || "https://community.wotgonline.com/";

    // 🔧 Build the notification payload
    const message = {
      token: fcmToken,
      notification: {
        title: title || "WOTG Community",
        body: body || "You have a new notification.",
        image:
          "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
      },
      data: {
        ...data,
        url, // ensures SW can open the correct page
      },

      // 📱 Android specific (heads-up + vibration + sound)
      android: {
        priority: "high",
        notification: {
          clickAction: url, // ensures tap opens link
          sound: "default",
          vibrateTimingsMillis: [200, 100, 200],
          defaultVibrateTimings: true,
          defaultSound: true,
          visibility: "public",
        },
      },

      // 💻 Web push specific (Chrome / Edge / Firefox)
      webpush: {
        headers: { Urgency: "high" }, // improves heads-up behavior
        notification: {
          icon: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          badge: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          vibrate: [200, 100, 200],
          requireInteraction: true, // stays until user taps
          tag: "wotg-message", // prevents stacking duplicates
        },
        fcmOptions: {
          link: url, // ✅ Chrome uses this when clicked
        },
      },
    };

    // 🚀 Send notification via Firebase Admin SDK
    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent to ${fcmToken.slice(0, 10)}... →`, response);
    return response;
  } catch (err) {
    console.error("❌ FCM sendNotification error:", err.message || err);
    return null;
  }
};
