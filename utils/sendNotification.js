const admin = require("../firebase"); // Import Firebase Admin SDK

exports.sendNotification = async (fcmToken, title, body) => {
    const message = {
        token: fcmToken, // FCM Token of the recipient
        notification: {
            title: title,
            body: body,
        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log("✅ Notification sent successfully:", response);
        return response;
    } catch (error) {
        console.error("❌ Error sending notification:", error);
    }
};
