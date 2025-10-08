const admin = require("../firebase");

exports.sendNotification = async (fcmToken, title, body, data = {}) => {
  try {
    const url = data?.url || "https://community.wotgonline.com/";

    // Convert all data values to strings
    const stringData = Object.fromEntries(
      Object.entries({ ...data, url }).map(([k, v]) => [k, String(v)])
    );

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
        image: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
      },
      data: stringData,
      android: {
        priority: "high",
        notification: {
          clickAction: url,
          sound: "default",
          vibrateTimingsMillis: [200, 100, 200],
          defaultVibrateTimings: true,
          visibility: "public", // ensures heads-up
          sticky: false,
          defaultSound: true,
          defaultVibrateTimings: true,
          notificationCount: 1,
          // eventTime removed ✅
        },
      },
      webpush: {
        notification: {
          icon: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          badge: "https://wotg.sgp1.cdn.digitaloceanspaces.com/images/wotgLogo.webp",
          vibrate: [200, 100, 200],
          requireInteraction: true,
          renotify: true,
          silent: false,
          timestamp: Date.now(), // ✅ safe here for Chrome heads-up
        },
        fcmOptions: {
          link: url,
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
