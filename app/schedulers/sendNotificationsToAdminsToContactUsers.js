const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const { sendNotification } = require("../../utils/sendNotification");

// Runs every hour (minute 0)
cron.schedule(
  "0 * * * *",
  async () => {
    try {
      const targetUserIds = [10, 49, 27, 251];

      const subscriptions = await Subscription.findAll({
        where: { user_id: targetUserIds },
      });

      if (!subscriptions.length) return;

      const reminderMessages = [
        "Don't forget to check in with our new users today.",
        "Reminder: Reach out to new users to help them feel welcome.",
        "Time to connect with our newest members.",
        "Reminder: Build relationships with new users and send a message today.",
        "Stay connected—reach out to new users.",
      ];

      const message =
        reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      for (const subscription of subscriptions) {
        try {
          let subscriptionData = subscription.subscription;

          if (typeof subscriptionData === "string") {
            try {
              subscriptionData = JSON.parse(subscriptionData);
            } catch {
              continue;
            }
          }

          const fcmToken =
            subscription.fcmToken ||
            subscription.fcm_token ||
            subscriptionData?.fcmToken ||
            subscriptionData?.token ||
            subscriptionData?.endpoint ||
            null;

          if (!fcmToken) continue;

          const data = {
            type: "admin_reminder",
            url: "https://management.wotgonline.com/users",
          };

          await sendNotification(
            fcmToken,
            "WOTG Admin Reminder",
            message,
            data
          );
        } catch {
          continue;
        }
      }
    } catch {
      // Silent fail in production
    }
  },
  { timezone: "Asia/Manila" }
);
