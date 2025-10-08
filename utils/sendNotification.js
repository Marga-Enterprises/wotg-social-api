const admin = require("../firebase"); // adjust path if needed

/**
 * Sends a push notification using Firebase Admin SDK
 * that supports heads-up display and clickable links.
 *
 * @param {string} fcmToken - Target user's FCM registration token
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional custom data (e.g. { url, chatroomId, type })
 */
exports.sendNotification = async (fcmToken, title, body, data = {}) => {
  try {
    const url = data?.url || "https://community.wotgonline.com/";

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
        image: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
      },
      data: {
        ...data,
        url, // ensure SW can open correct page
      },
      android: {
        priority: "high",
        notification: {
          clickAction: url, // 🔗 makes it clickable in Android
          sound: "default",
          vibrateTimingsMillis: [200, 100, 200],
          defaultVibrateTimings: true,
        },
      },
      webpush: {
        notification: {
          icon: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          badge: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          vibrate: [200, 100, 200],
          requireInteraction: true, // stays visible until clicked
        },
        fcmOptions: {
          link: url, // ✅ Chrome uses this to open when clicked
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ FCM sent to ${fcmToken.substring(0, 10)}... :`, response);
    return response;
  } catch (err) {
    console.error("❌ FCM sendNotification error:", err);
  }
};

